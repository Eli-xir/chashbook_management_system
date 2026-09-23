import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readAdminData, saveAdminData } from '../src/data/adminStore.ts';

let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    },
  });
});

test('refresh reloads applied permissions and multiple contacts', () => {
  const data = readAdminData();
  data.permissions = { 'admin-1': [4, 8] };
  data.users = data.users.map((user) => ({ ...user, contacts: ['0300', '0311'] }));
  saveAdminData(data);
  const refreshed = readAdminData();
  assert.deepEqual(refreshed.permissions, { 'admin-1': [4, 8] });
  assert.deepEqual(refreshed.users[0].contacts, ['0300', '0311']);
});

test('legacy heads are imported without overwriting a newer admin snapshot', () => {
  values.set('cashbook.heads.v1', JSON.stringify([{ head_id: 4, head_name: 'Legacy' }]));
  const migrated = readAdminData();
  assert.equal(migrated.heads[0].head_name, 'Legacy');
  saveAdminData({ ...migrated, heads: [] });
  assert.deepEqual(readAdminData().heads, []);
});

test('unreadable saved data and failed writes surface errors instead of claiming success', () => {
  const data = readAdminData();
  values.set('cashbook.admin.v1', '{broken');
  assert.throws(readAdminData);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { setItem: () => { throw new Error('Quota exceeded'); } },
  });
  assert.throws(() => saveAdminData(data), /Quota/);
});
