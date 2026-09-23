import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_ID, cashbookApi } from '../src/data/cashbookApi.ts';
import { readAdminData, saveAdminData } from '../src/data/adminStore.ts';
import { permittedHeads } from '../src/pages/Admin/utils/permissions.ts';
import { buildHeadTree } from '../src/pages/Admin/utils/headTree.ts';
import type { DeleteHeadChange, TransactionInput } from '../src/pages/Admin/types.ts';

let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } });
});
const create = (name = 'Worker') => cashbookApi.createUser({ user_name: name, contacts: ['0300', '0311'], password: 'demo-password' });
async function setup() {
  const { user } = await create();
  await cashbookApi.saveHeads([
    { op: 'create', temp_id: -1, head_name: 'Site', parent_head_id: null },
    { op: 'create', temp_id: -2, head_name: 'Concrete', parent_head_id: -1 },
  ]);
  await cashbookApi.savePermissions(user.user_id, [-2]);
  return user.user_id;
}
const input: TransactionInput = { amount: 250, categoryId: 1, headId: -2, attachments: [] };

test('create, refresh and password acknowledgement never persist credentials', async () => {
  const { user } = await create('  Ali  ');
  assert.equal(user.user_name, 'Ali');
  assert.deepEqual(user.contacts, ['0300', '0311']);
  await cashbookApi.changePassword(user.user_id, 'changed-secret');
  const refreshed = await cashbookApi.refresh();
  assert.equal(refreshed.users.length, 2);
  assert.equal(refreshed.users[1].user_id, user.user_id);
  assert.equal(JSON.stringify([...values]).includes('demo-password'), false);
  assert.equal(JSON.stringify([...values]).includes('changed-secret'), false);
  await assert.rejects(create('Ali'), /already/);
  await assert.rejects(cashbookApi.createUser({ user_name: 'Another', contacts: [], password: '' }), /password/);
});

test('admin permissions and destructive account actions are rejected by the adapter', async () => {
  await assert.rejects(cashbookApi.savePermissions(ADMIN_ID, [-1]), /admin/);
  await assert.rejects(cashbookApi.userAction(ADMIN_ID, 'delete'), /admin/);
  assert.equal(readAdminData().users.length, 1);
});

test('isolated assigned children are browsable and both categories accept the same head', async () => {
  const id = await setup();
  const data = await cashbookApi.refresh();
  const visible = permittedHeads(data.heads, data.permissions[id]);
  assert.deepEqual(buildHeadTree(visible).map((head) => head.head_id), [-2]);
  await cashbookApi.submitTransaction(id, input);
  await cashbookApi.submitTransaction(id, { ...input, categoryId: 2 });
  assert.equal(readAdminData().transactions.length, 2);
  await cashbookApi.saveHeads([{ op: 'move', head_id: -2, new_parent_id: null }]);
  assert.deepEqual(readAdminData().permissions[id], [-2]);
  assert.equal(readAdminData().transactions.length, 2);
});

test('balance and visible credits exclude own spends, inactive credits and other users', async () => {
  const id = await setup();
  const data = readAdminData();
  const credit = { ...input, id: 'credit-1', userId: id, createdBy: ADMIN_ID, active: true, createdAt: new Date().toISOString(), amount: 900 };
  data.transactions = [credit, { ...credit, id: 'inactive', active: false }, { ...credit, id: 'other', userId: 'someone-else' }];
  saveAdminData(data);
  const receipt = await cashbookApi.submitTransaction(id, { ...input, attachments: [
    { id: 'picture', name: 'receipt.png', kind: 'image', url: 'data:image/png;base64,AA==' },
    { id: 'voice', name: 'note.webm', kind: 'voice', url: 'data:audio/webm;base64,AA==' },
  ] });
  const overview = await cashbookApi.userOverview(id);
  assert.equal(overview.balance, 900);
  assert.deepEqual(overview.credits.map((item) => item.id), ['credit-1']);
  const saved = readAdminData().transactions.find((item) => item.id === receipt.id)!;
  assert.equal(saved.createdBy, id);
  assert.equal(saved.attachments.length, 2);
  await assert.rejects(cashbookApi.userAction(id, 'delete'), /Deactivate/);
});

test('submission validates current permissions, head state, account state and amount', async () => {
  const id = await setup();
  await assert.rejects(cashbookApi.submitTransaction(id, { ...input, amount: NaN }), /amount/);
  await assert.rejects(cashbookApi.submitTransaction(id, { ...input, headId: -1 }), /permitted/);
  await cashbookApi.savePermissions(id, []);
  await assert.rejects(cashbookApi.submitTransaction(id, input), /permitted/);
  await cashbookApi.savePermissions(id, [-2]);
  const data = readAdminData();
  data.heads[1].is_transactionable = false;
  saveAdminData(data);
  await assert.rejects(cashbookApi.submitTransaction(id, input), /permitted/);
  await cashbookApi.userAction(id, 'deactivate');
  await assert.rejects(cashbookApi.submitTransaction(id, input), /deactivated/);
  assert.equal(readAdminData().transactions.length, 0);
});

test('reactivation respects active-name uniqueness and delete removes permissions', async () => {
  const { user } = await create();
  await cashbookApi.savePermissions(user.user_id, [1]);
  await cashbookApi.userAction(user.user_id, 'deactivate');
  await create();
  await assert.rejects(cashbookApi.userAction(user.user_id, 'reactivate'), /already/);
  await cashbookApi.userAction(user.user_id, 'delete');
  assert.equal(readAdminData().permissions[user.user_id], undefined);
});

test('failed storage does not acknowledge a transaction or lose previously saved data', async () => {
  const id = await setup();
  const saved = values.get('cashbook.admin.v1');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: () => { throw new Error('Storage full'); },
  } });
  await assert.rejects(cashbookApi.submitTransaction(id, input), /Storage full/);
  assert.equal(values.get('cashbook.admin.v1'), saved);
});

for (const policy of ['hard_delete', 'backup'] as const) {
  test(`head deletion keeps the ${policy} request at the adapter boundary`, async () => {
    const id = await setup();
    await cashbookApi.submitTransaction(id, input);
    const request: DeleteHeadChange = { op: 'delete', head_id: -2, transaction_handling: policy };
    await cashbookApi.saveHeads([request]);
    const saved = await cashbookApi.refresh();
    assert.equal(saved.heads.some((head) => head.head_id === -2), false);
    assert.deepEqual(saved.headDeletionRequests, [request]);
    assert.deepEqual(saved.permissions[id], [-2]);
    // Actual transaction cleanup / backup file creation is future backend work.
    assert.equal(saved.transactions.length, 1);
    await assert.rejects(cashbookApi.submitTransaction(id, input), /permitted/);
  });
}

test('applied transactionable changes block and re-enable transaction submission', async () => {
  const id = await setup();
  const edit = { op: 'edit' as const, head_id: -2, head_name: 'Concrete', image_url: null, is_transactionable: false };
  await cashbookApi.saveHeads([edit]);
  await assert.rejects(cashbookApi.submitTransaction(id, input), /permitted/);
  await cashbookApi.saveHeads([{ ...edit, is_transactionable: true }]);
  assert.equal((await cashbookApi.submitTransaction(id, input)).applied, true);
});
