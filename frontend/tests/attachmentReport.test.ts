import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentTransactions } from '../src/pages/Ledger/attachmentReport.ts';
import type { FiltersState, Transaction, Head } from '../src/pages/Admin/types.ts';
const filters: FiltersState = { dateFrom: '', dateTo: '', direction: 'both', userScope: 'user' };
const image = { id: '1', kind: 'image' as const, name: 'Receipt', url: '/api/attachments/1' };
const base: Transaction = { id: '1', userId: 'user', createdBy: 'admin', headId: null, amount: 100, active: true, createdAt: '2026-09-20T09:30:59', attachments: [image] };
const entries: Transaction[] = [base,
  { ...base, id: '2', headId: 2, createdBy: 'user', createdAt: '2026-09-21T08:00:00' },
  { ...base, id: '3', active: false }, { ...base, id: '4', attachments: [] },
  { ...base, id: '5', userId: 'admin', creditUserId: 'external' },
];
const heads: Head[] = [
  { head_id: 1, parent_head_id: null, head_name: 'Parent', is_active: true, is_transactionable: false },
  { head_id: 2, parent_head_id: 1, head_name: 'Child', is_active: true, is_transactionable: true },
];
const ids = (f: FiltersState) => attachmentTransactions(entries, f, heads).map((e) => e.id);
test('Attachment list includes headless admin entries and excludes inactive or empty transactions', () => {
  assert.deepEqual(ids(filters), ['1', '2']);
  assert.deepEqual(ids({ ...filters, userScope: 'credit:external' }), ['5']);
  assert.deepEqual(ids({ ...filters, headId: 1 }), ['2']);
});
test('Date endpoints refine time inclusively; intermediate dates are unrestricted', () => {
  assert.deepEqual(ids({ ...filters, dateFrom: '2026-09-20', timeFrom: '09:30', dateTo: '2026-09-21', timeTo: '08:00' }), ['1', '2']);
  assert.deepEqual(ids({ ...filters, dateFrom: '2026-09-20', timeFrom: '09:31' }), ['2']);
  assert.deepEqual(ids({ ...filters, dateTo: '2026-09-20', timeTo: '09:30' }), ['1']);
});
test('Time without dates applies as a daily window', () => {
  assert.deepEqual(ids({ ...filters, timeFrom: '09:00', timeTo: '10:00' }), ['1']);
});

test('Description and user-statement credit filters include admin payments without heads', () => {
  const described = entries.map((entry) => ({ ...entry, description: entry.id === '1' ? 'Advance for supplies' : 'Other' }));
  assert.deepEqual(attachmentTransactions(described, { ...filters, description: 'SUPPLIES', direction: 'credit' }, heads).map((entry) => entry.id), ['1']);
  assert.deepEqual(attachmentTransactions(described, { ...filters, direction: 'debit' }, heads).map((entry) => entry.id), ['2']);
});
