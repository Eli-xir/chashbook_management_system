import type { AppSession, Attachment, Category, CreateUserInput, CashbookData, StagedChange, Transaction, TransactionInput, UserAction, UserOverview, UserProfile } from '../pages/Admin/types';

type State = CashbookData & { categories: Category[]; transactionTypes: Category[]; headRevision: number };
let headRevision = 0;
const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, { ...options, credentials: 'same-origin',
      headers: { 'X-Cashbook': '1', ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers } });
  } catch { throw new Error('Could not reach the backend. Check your connection and that uvicorn is running.'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/session') window.dispatchEvent(new Event('cashbook:session-expired'));
    const detail = body?.detail;
    throw new Error(typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map((item: { msg: string }) => item.msg).join(' · ')
      : 'The backend could not complete this request. Check that uvicorn is running.');
  }
  return body as T;
}

function change<T>(body: object): Promise<T> {
  return request('/changes', { method: 'POST', body: JSON.stringify(body) });
}
function remember(data: State) { headRevision = data.headRevision; return data; }

// The sole frontend/backend boundary. Components keep their existing interfaces.
export const cashbookApi = {
  currentSession: () => request<AppSession | null>('/session'),
  signIn: (username: string, password: string) => request<AppSession>('/session', { method: 'POST', body: JSON.stringify({ username, password }) }),
  signOut: () => request('/session', { method: 'DELETE' }),
  refresh: async () => remember(await request<State>('/state')),
  ledger: () => request<State>('/state'),
  saveHeads: async (changes: StagedChange[]) => remember(await change<State>({ op: 'heads', revision: headRevision, changes })),
  savePermissions: (userId: string, ids: number[]) => change<State>({ op: 'permissions', userId, ids }),
  saveProfile: (userId: string, profile: UserProfile) => change<State>({ op: 'user', action: 'profile', userId, profile }),
  createUser: ({ password, ...profile }: CreateUserInput) => change<{ data: State; user: State['users'][number] }>({ op: 'user', action: 'create', profile, password }),
  changePassword: (userId: string, password: string) => change<State>({ op: 'user', action: 'password', userId, password }),
  userAction: (userId: string, action: UserAction) => change<State>({ op: 'user', action, userId }),
  createCategory: (name: string) => change<State>({ op: 'category', name }),
  deleteCategory: (id: number) => change<State>({ op: 'category', action: 'delete', id }),
  userOverview: (userId: string) => request<UserOverview>(`/state?userId=${encodeURIComponent(userId)}`),
  submitTransaction: (userId: string, input: TransactionInput) => change<{ id: string; applied: boolean }>({ op: 'transaction', action: 'submit', userId, input }),
  creditUser: (userId: string, input: TransactionInput) => change<Transaction>({ op: 'transaction', action: 'credit', userId, input }),
  editTransaction: (id: string, input: TransactionInput, expectedVersion: string) => change<Transaction>({ op: 'transaction', action: 'edit', id: Number(id), input, expectedVersion: Number(expectedVersion) }),
  transactionAction: (id: string, action: 'deactivate' | 'reactivate' | 'delete', expectedVersion: string) => change<Transaction | null>({ op: 'transaction', action, id: Number(id), expectedVersion: Number(expectedVersion) }),
  async uploadAttachment(file: File, kind: Attachment['kind'], maxBytes = 5 * 1024 * 1024) {
    if (!file.size || file.size > maxBytes) throw new Error('Choose a file up to 5 MB.');
    const form = new FormData(); form.append('file', file); form.append('kind', kind);
    return request<Attachment>('/attachments', { method: 'POST', body: form });
  },
};
