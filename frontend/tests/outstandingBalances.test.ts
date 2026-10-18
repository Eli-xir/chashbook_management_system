import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outstandingBalances, balanceTotal } from '../src/pages/Admin/utils/outstandingBalances.ts';
import type { AdminUser, Transaction } from '../src/pages/Admin/types.ts';
const user = (id: string, active = true): AdminUser => ({ user_id: id, user_name: id, role: 'user', is_active: active });
const entry = (id: string, amount: number, bill = false, active = true): Transaction => ({ id: `${id}-${amount}`, userId: id, createdBy: bill ? id : 'admin', headId: null, amount, active, createdAt: '2026-10-19T12:00:00Z', attachments: [] });

test('Balances classify advances and unpaid bills, omit settled and external/admin accounts, and retain inactive debts', () => {
  const users = [user('advance'), user('bill'), user('settled'), user('empty'), user('inactive', false), { ...user('admin'), role: 'admin' as const }];
  const transactions = [entry('advance', 1000), entry('advance', 300, true), entry('bill', 100), entry('bill', 450, true),
    entry('settled', 80), entry('settled', 80, true), entry('inactive', 25, true), entry('admin', 500),
    entry('advance', 9000, true, false), { ...entry('bill', 5000), creditUserId: 'external' }];
  const result = outstandingBalances(users, transactions);
  assert.deepEqual(result.map(({ user, category, amount }) => [user.user_id, category, amount]), [
    ['advance', 'receivable', 700], ['bill', 'payable', 350], ['inactive', 'payable', 25],
  ]);
  assert.equal(balanceTotal(result.filter((item) => item.category === 'payable')), 375);
});

test('Amounts round to cents and refreshes can move a user between categories or settle them', () => {
  const users = [user('person')];
  assert.deepEqual(outstandingBalances(users, [entry('person', 0.1), entry('person', 0.2), entry('person', 0.3, true)]), []);
  assert.equal(outstandingBalances(users, [entry('person', 100)])[0].category, 'receivable');
  assert.deepEqual(outstandingBalances(users, [entry('person', 100), entry('person', 150, true)])[0], { user: users[0], category: 'payable', amount: 50 });
});
