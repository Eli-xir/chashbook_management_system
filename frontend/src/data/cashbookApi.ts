import { readAdminData, saveAdminData } from './adminStore.ts';
import { applyHeadChanges } from '../pages/Admin/utils/headTree.ts';
import { validateProfile } from '../pages/Admin/utils/userProfile.ts';
import { accountTotals, headPath, historyOf } from '../pages/Ledger/ledgerModel.ts';
import type { AppSession, Attachment, CreateUserInput, MockData, StagedChange, Transaction, TransactionInput, UserAction, UserOverview, UserProfile } from '../pages/Admin/types.ts';

export const ADMIN_ID = 'admin-1';
const categories = [{ id: 1, name: 'Material' }, { id: 2, name: 'Labour' }];

// Stand-in IDs in mock responses only. Real create requests omit IDs; the database assigns them.
function mockId() {
  const key = 'cashbook.mock-sequence';
  const next = (Number(localStorage.getItem(key)) || 0) + 1;
  localStorage.setItem(key, String(next));
  return `mock-${next}`;
}

function account(data: MockData, id: string) {
  const user = data.users.find((item) => item.user_id === id);
  if (!user) throw new Error('This user no longer exists.');
  return user;
}
function fieldUser(data: MockData, id: string) {
  if (id === ADMIN_ID) throw new Error('The admin has full access; individual permissions do not apply.');
  return account(data, id);
}
function profileFor(data: MockData, input: UserProfile, id?: string) {
  const profile = validateProfile(input);
  if (data.users.some((user) => user.user_id !== id && user.is_active && user.user_name === profile.user_name)) {
    throw new Error('An active user already has that name.');
  }
  return profile;
}
function commit(data: MockData) { saveAdminData(data); return data; }
function requireAdmin() {
  if (sessionStorage.getItem('cashbook.session-user') !== ADMIN_ID) throw new Error('Admin access is required.');
}
function validateTransaction(data: MockData, input: TransactionInput) {
  if (!Number.isFinite(input.amount) || input.amount < 0) throw new Error('Enter a non-negative amount.');
  if (!data.heads.some((head) => head.head_id === input.headId && head.is_active && head.is_transactionable)) throw new Error('Choose an active transactionable head.');
  if (!categories.some((item) => item.id === input.categoryId)) throw new Error('Choose a category.');
  if (input.transactionTypeId !== undefined && input.transactionTypeId !== 1) throw new Error('Choose a transaction type.');
}
function labelTransaction(data: MockData, input: TransactionInput) {
  return { ...input, transactionTypeId: input.transactionTypeId ?? 1,
    headPath: headPath(data.heads, input.headId), categoryName: categories.find((item) => item.id === input.categoryId)?.name };
}
function revise(entry: Transaction, editorId: string, action: string) {
  return { versionId: mockId(), recordedAt: new Date().toISOString(), editorId, action,
    amount: entry.amount, headId: entry.headId, categoryId: entry.categoryId, transactionTypeId: entry.transactionTypeId,
    attachments: entry.attachments.map((item) => ({ ...item })), active: entry.active, headPath: entry.headPath, categoryName: entry.categoryName };
}

// Async communication boundary. Replace these implementations when the backend is ready.
// Every mutation reads the latest snapshot and returns the applied result, like a server response.
export const cashbookApi = {
  currentSession(): AppSession | null {
    const id = sessionStorage.getItem('cashbook.session-user');
    const user = id && readAdminData().users.find((item) => item.user_id === id && item.is_active);
    return user ? { userId: user.user_id, role: user.user_id === ADMIN_ID ? 'admin' : 'user' } : null;
  },
  async signIn(username: string, password: string) {
    if (!username.trim() || !password) throw new Error('Enter your username and password.');
    const users = readAdminData().users;
    const user = users.find((item) => item.is_active && item.user_name === username.trim())
      ?? (username.trim().toLowerCase() === 'admin' ? users.find((item) => item.user_id === ADMIN_ID && item.is_active) : undefined);
    if (!user) throw new Error('No active account with that username.');
    // Frontend simulation: passwords are not verified or stored. Replace with server authentication.
    sessionStorage.setItem('cashbook.session-user', user.user_id);
    return { userId: user.user_id, role: user.user_id === ADMIN_ID ? 'admin' : 'user' } as AppSession;
  },
  async signOut() { sessionStorage.removeItem('cashbook.session-user'); return { applied: true }; },
  async refresh() { return readAdminData(); },
  async ledger() {
    requireAdmin();
    return { ...readAdminData(), categories, transactionTypes: [{ id: 1, name: 'General' }] };
  },
  async creditUser(userId: string, input: TransactionInput) {
    requireAdmin();
    const data = readAdminData();
    if (!fieldUser(data, userId).is_active) throw new Error('This account is deactivated.');
    validateTransaction(data, input);
    const entry: Transaction = { ...labelTransaction(data, input), id: mockId(), userId, createdBy: ADMIN_ID, active: true, createdAt: new Date().toISOString() };
    entry.versions = [revise(entry, ADMIN_ID, 'Created')];
    data.transactions.push(entry); commit(data); return entry;
  },
  async editTransaction(id: string, input: TransactionInput, expectedVersion: string) {
    requireAdmin();
    const data = readAdminData();
    const entry = data.transactions.find((item) => item.id === id);
    if (!entry) throw new Error('This transaction no longer exists.');
    const versions = historyOf(entry);
    if (versions.at(-1)?.versionId !== expectedVersion) throw new Error('This entry changed. Close and reopen the card before editing.');
    validateTransaction(data, input);
    Object.assign(entry, labelTransaction(data, input));
    entry.versions = [...versions, revise(entry, ADMIN_ID, 'Edited')];
    commit(data); return entry;
  },
  async transactionAction(id: string, action: 'deactivate' | 'reactivate' | 'delete', expectedVersion: string) {
    requireAdmin();
    const data = readAdminData();
    const entry = data.transactions.find((item) => item.id === id);
    if (!entry) throw new Error('This transaction no longer exists.');
    const versions = historyOf(entry);
    if (versions.at(-1)?.versionId !== expectedVersion) throw new Error('This entry changed. Close and reopen the card.');
    if (action === 'delete') data.transactions = data.transactions.filter((item) => item.id !== id);
    else {
      entry.active = action === 'reactivate';
      entry.versions = [...versions, revise(entry, ADMIN_ID, entry.active ? 'Reactivated' : 'Deactivated')];
    }
    commit(data); return action === 'delete' ? null : entry;
  },
  async saveHeads(changes: StagedChange[]) {
    const data = readAdminData();
    data.heads = applyHeadChanges(data.heads, changes);
    // Keep the selected policy at the communication boundary. Real transaction cleanup
    // and backup file creation belong to the future backend, not the tree editor.
    data.headDeletionRequests = [...(data.headDeletionRequests ?? []), ...changes.filter((change) => change.op === 'delete')];
    return commit(data);
  },
  async savePermissions(userId: string, ids: number[]) {
    const data = readAdminData();
    fieldUser(data, userId);
    data.permissions = { ...data.permissions, [userId]: [...new Set(ids)] };
    return commit(data);
  },
  async saveProfile(userId: string, input: UserProfile) {
    const data = readAdminData();
    const user = account(data, userId);
    const profile = user.is_active ? profileFor(data, input, userId) : validateProfile(input);
    data.users = data.users.map((item) => item.user_id === userId ? { ...item, ...profile, contact_no: undefined } : item);
    return commit(data);
  },
  async createUser(input: CreateUserInput) {
    const data = readAdminData();
    const profile = profileFor(data, input);
    if (!input.password.trim()) throw new Error('Enter an initial password.');
    const user = { ...profile, user_id: mockId(), is_active: true };
    data.users = [...data.users, user];
    commit(data);
    return { data, user };
  },
  async changePassword(userId: string, password: string) {
    account(readAdminData(), userId);
    if (!password.trim()) throw new Error('Enter a new password.');
    // Simulated acknowledgement only. Never persist plaintext credentials.
    return { applied: true };
  },
  async userAction(userId: string, action: UserAction) {
    const data = readAdminData();
    const user = fieldUser(data, userId);
    if (action === 'delete') {
      if (data.transactions.some((item) => item.userId === userId || item.createdBy === userId)) {
        throw new Error('This user has transactions. Deactivate the account instead.');
      }
      data.users = data.users.filter((item) => item.user_id !== userId);
      delete data.permissions[userId];
    } else {
      if (action === 'reactivate') profileFor(data, { user_name: user.user_name, contacts: user.contacts ?? [] }, userId);
      user.is_active = action === 'reactivate';
    }
    return commit(data);
  },
  async userOverview(userId: string): Promise<UserOverview> {
    const data = readAdminData();
    if (!fieldUser(data, userId).is_active) throw new Error('This account is deactivated.');
    const credits = data.transactions.filter((item) => item.active && item.userId === userId && item.createdBy !== userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((entry) => ({ ...entry, versions: undefined,
        headPath: entry.headPath ?? headPath(data.heads, entry.headId),
        categoryName: entry.categoryName ?? categories.find((item) => item.id === entry.categoryId)?.name }));
    const totals = accountTotals(data.transactions.filter((entry) => entry.userId === userId));
    // Expose bill totals only; individual self-submitted transactions remain hidden.
    return { balance: totals.totalReceived, ...totals, credits, categories };
  },
  async submitTransaction(userId: string, input: TransactionInput) {
    const data = readAdminData();
    if (!fieldUser(data, userId).is_active) throw new Error('This account is deactivated.');
    const head = data.heads.find((item) => item.head_id === input.headId);
    if (!head?.is_active || !head.is_transactionable || !data.permissions[userId]?.includes(input.headId)) {
      throw new Error('Choose an active, permitted transaction head. Apply permission changes first.');
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Enter an amount greater than zero.');
    if (!categories.some((item) => item.id === input.categoryId)) throw new Error('Choose a category.');
    const transaction: Transaction = { ...labelTransaction(data, input), id: mockId(), userId, createdBy: userId, active: true, createdAt: new Date().toISOString() };
    transaction.versions = [revise(transaction, userId, 'Created')];
    data.transactions = [...data.transactions, transaction];
    commit(data);
    return { id: transaction.id, applied: true };
  },
  async uploadAttachment(file: File, kind: Attachment['kind'], maxBytes = 5 * 1024 * 1024): Promise<Attachment> {
    const extensionMatches = (kind === 'image' ? /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i : /\.(mp3|m4a|wav|ogg|webm|aac|flac)$/i).test(file.name);
    const matchesKind = file.type ? file.type.startsWith(kind === 'image' ? 'image/' : 'audio/') : extensionMatches;
    if (!matchesKind || file.size === 0 || file.size > maxBytes) {
      throw new Error(`Choose a ${kind === 'image' ? 'picture' : 'voice file'} up to ${maxBytes / 1024 / 1024} MB.`);
    }
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read the attachment.'));
      reader.readAsDataURL(file);
    });
    return { id: mockId(), name: file.name, kind, url };
  },
};
