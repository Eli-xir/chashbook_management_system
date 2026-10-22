import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contractBalance } from '../src/pages/Admin/utils/contractBalances.ts';
import { ledgerReport } from '../src/pages/Ledger/ledgerModel.ts';
import type { Contract, Transaction } from '../src/pages/Admin/types.ts';

const contract: Contract = { id: 'a', name: 'Shared contract', description: '', totalAmount: 1000, creditUserIds: ['payer1', 'payer2'], isActive: true, revision: 1 };
const receipt = (id: string, contractId: string | null, creditUserId: string, amount: number, active = true): Transaction => ({
  id, contractId, creditUserId, amount, active, userId: 'admin', createdBy: 'admin', headId: null,
  createdAt: '2026-10-19T12:00:00Z', attachments: [],
});

test('No-contract filter isolates legacy receipts including opening balances', () => {
  const filters = { contractId: '__none__', userScope: 'credit:payer1', dateFrom: '', dateTo: '', direction: 'both' as const };
  const report = ledgerReport(entries, filters, 'by-time', [], true);
  assert.deepEqual(report.rows.map((row) => row.entry.id), ['4']);
  assert.equal(report.credit, 500);
  const later = ledgerReport(entries, { ...filters, dateFrom: '2026-10-20' }, 'by-time', [], true);
  assert.equal(later.opening, 500);
  assert.equal(later.closing, 500);
});
const entries = [receipt('1', 'a', 'payer1', 100), receipt('2', 'a', 'payer2', 250),
  receipt('3', 'b', 'payer1', 800), receipt('4', null, 'payer1', 500), receipt('5', 'a', 'payer2', 50, false)];

test('A shared contract combines linked payers without counting other contracts, legacy receipts, or inactive entries', () => {
  assert.deepEqual(contractBalance(contract, entries), { received: 350, remaining: 650 });
  assert.deepEqual(contractBalance(contract, [...entries, receipt('6', 'a', 'payer2', 650)]), { received: 1000, remaining: 0 });
  assert.deepEqual(contractBalance({ ...contract, totalAmount: 0.3 }, [receipt('1', 'a', 'payer1', 0.1), receipt('2', 'a', 'payer2', 0.2)]), { received: 0.3, remaining: 0 });
});

test('Contract statements and individual payer statements isolate rows and opening balances', () => {
  const filters = { contractId: 'a', userScope: 'all', dateFrom: '', dateTo: '', direction: 'both' as const };
  const report = ledgerReport(entries, filters, 'by-time', [], true);
  assert.deepEqual(report.rows.map((row) => row.entry.id), ['1', '2']);
  assert.equal(report.credit, 350);
  assert.equal(report.debit, 0);
  const payer = ledgerReport(entries, { ...filters, userScope: 'credit:payer1' }, 'by-time', [], true);
  assert.equal(payer.closing, 100);
  const later = ledgerReport(entries, { ...filters, dateFrom: '2026-10-20' }, 'by-time', [], true);
  assert.equal(later.opening, 350);
  assert.equal(later.rows.length, 0);
});
