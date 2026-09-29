import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountTotals, ledgerReport } from '../src/pages/Ledger/ledgerModel.ts';
import type { FiltersState, Head, Transaction } from '../src/pages/Admin/types.ts';

const filters: FiltersState = { dateFrom: '', dateTo: '', userScope: 'all', direction: 'both' };
const heads: Head[] = [
  { head_id: 1, parent_head_id: null, head_name: 'Office', is_active: true, is_transactionable: false },
  { head_id: 2, parent_head_id: 1, head_name: 'Utilities', is_active: true, is_transactionable: true },
];
const entries: Transaction[] = [
  { id: '1', userId: 'admin', createdBy: 'admin', creditUserId: 'external', headId: null, amount: 1000, active: true, createdAt: '2026-09-01T12:00:00Z', attachments: [] },
  { id: '2', userId: 'user', createdBy: 'admin', headId: null, amount: 200, active: true, createdAt: '2026-09-02T12:00:00Z', attachments: [] },
  { id: '3', userId: 'user', createdBy: 'user', headId: 2, amount: 50, active: true, createdAt: '2026-09-03T12:00:00Z', attachments: [] },
  { id: '4', userId: 'user', createdBy: 'admin', headId: null, amount: 9000, active: false, createdAt: '2026-09-03T12:00:00Z', attachments: [] },
];

test('All heads includes headless receipts/payments, even when the head tree is empty', () => {
  for (const headId of [undefined, null]) for (const tree of [heads, []]) {
    const report = ledgerReport(entries, { ...filters, headId }, 'by-time', tree, true);
    assert.deepEqual(report.rows.map(({ entry }) => entry.id), ['1', '2']);
    assert.equal(report.credit, 1000);
    assert.equal(report.debit, 200);
    assert.equal(report.closing, 800);
    assert.equal(report.remainingPayable, 800);
    assert.equal(accountTotals(entries).remainingPayable, 850);
  }
});

test('User and external-user filters retain their direct entries with correct signs', () => {
  const user = ledgerReport(entries, { ...filters, userScope: 'user' }, 'by-time', heads);
  assert.equal(user.credit, 200);
  assert.equal(user.debit, 50);
  assert.equal(user.closing, 150);
  const external = ledgerReport(entries, { ...filters, userScope: 'credit:external' }, 'by-time', heads, true);
  assert.deepEqual(external.rows.map(({ entry }) => entry.id), ['1']);
  assert.equal(external.closing, 1000);
});

test('A selected branch only includes its entries, and clearing it restores direct payments', () => {
  const report = ledgerReport(entries, { ...filters, headId: 1 }, 'by-time', heads);
  assert.deepEqual(report.rows.map(({ entry }) => entry.id), ['3']);
  assert.equal(report.closing, -50);
  assert.equal(ledgerReport(entries, { ...filters, headId: null }, 'by-time', heads, true).closing, 800);
});

test('Headless entries participate in date opening balances and every arrangement', () => {
  for (const order of ['by-time', 'credit-first', 'debit-first'] as const) {
    const report = ledgerReport(entries, { ...filters, dateFrom: '2026-09-02' }, order, heads, true);
    assert.equal(report.opening, 1000);
    assert.equal(report.closing, 800);
    // Page exports use these same running balances for carry-forward rows.
    let carried = report.opening;
    for (const { entry, balance } of report.rows) {
      carried += entry.createdBy === entry.userId ? entry.amount : -entry.amount;
      assert.equal(balance, carried);
    }
  }
});

test('Credit-only and debit-only views include direct entries', () => {
  const credits = ledgerReport(entries, { ...filters, direction: 'credit' }, 'by-time', heads, true);
  const debits = ledgerReport(entries, { ...filters, direction: 'debit' }, 'by-time', heads, true);
  assert.equal(credits.closing, 1000);
  assert.equal(debits.closing, -200);
});

test('Company excludes user bills with missing or null external IDs without hiding admin payments', () => {
  const report = ledgerReport([...entries,
    { ...entries[2], id: 'bill-null', creditUserId: null },
    { ...entries[1], id: 'payment-null', creditUserId: null, amount: 100 },
    { ...entries[0], id: 'inactive-receipt', active: false },
  ], filters, 'by-time', [], true);
  assert.deepEqual(report.rows.map(({ entry }) => entry.id), ['1', '2', 'payment-null']);
  assert.equal(report.credit, 1000);
  assert.equal(report.debit, 300);
  assert.equal(report.closing, 700);
});

test('Company user filters isolate external receipts and internal payments', () => {
  const external = ledgerReport(entries, { ...filters, userScope: 'credit:external' }, 'by-time', [], true);
  assert.equal(external.credit, 1000);
  assert.equal(external.debit, 0);
  const internal = ledgerReport(entries, { ...filters, userScope: 'user' }, 'by-time', [], true);
  assert.deepEqual(internal.rows.map(({ entry }) => entry.id), ['2']);
  assert.equal(internal.credit, 0);
  assert.equal(internal.debit, 200);
  assert.equal(internal.closing, -200);
});
