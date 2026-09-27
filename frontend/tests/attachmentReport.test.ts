import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentTransactions, attachmentPdf, imageOrientation } from '../src/pages/Ledger/attachmentReport.ts';
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

const document = {
  title: 'Test statement', subtitle: 'From: 2026-09-20 09:00 | To: 2026-09-27 18:00', printedAt: '2026-09-27 19:00',
  columns: ['Date/time', 'User', 'Entered by', 'Head', 'Description', 'Credit', 'Debit', 'Balance'],
  pages: [[['Balance brought forward', '', '', '', '', '', '', 0], ['Totals / closing balance', '', '', '', '', 100, 0, 100]]],
};
test('Combined PDF retains headless entries without media and long descriptions across pages', async () => {
  const entry = { ...base, attachments: [] };
  const description = 'START ' + 'Detailed transaction notes '.repeat(600) + ' FINISH';
  const file = await attachmentPdf([{ entry, cells: ['2026-09-20', 'Ali', 'Admin', 'No head', description, 100, '', 100] }], document, 4,
    async () => { throw new Error('No download should be attempted'); });
  const pdf = await file.text();
  assert.equal(file.type, 'application/pdf');
  assert.match(pdf, /From: 2026-09-20 09:00/);
  assert.match(pdf, /To: 2026-09-27 18:00/);
  assert.match(pdf, /Printed: 2026-09-27 19:00/);
  assert.match(pdf, /START/);
  assert.match(pdf, /FINISH/);
  assert.match(pdf, /No attachments/);
  assert.match(pdf, /Totals \/ closing balance/);
  assert.ok((pdf.match(/\/Type \/Page\b/g) ?? []).length > 1);
});
test('Combined PDF fails rather than exporting an incomplete batch', async () => {
  await assert.rejects(attachmentPdf([{ entry: base, cells: ['2026-09-20', 'Ali', 'Admin', '', '', 100, '', 100] }], document, 4,
    async () => { throw new Error('Storage unavailable'); }), /Storage unavailable/);
});

test('Export downloads all unique images in exactly one call', async () => {
  let calls = 0;
  await assert.rejects(attachmentPdf([
    { entry: { ...base, attachments: [image, { ...image, id: '2' }] }, cells: ['First'] },
    { entry: base, cells: ['Second'] },
  ], document, 4, async (ids) => {
    calls++;
    assert.deepEqual(ids, ['1', '2']);
    return {};
  }), /missing from the export response/);
  assert.equal(calls, 1);
});

test('Image orientation uses wide space for tall receipts and preserves upright images when they fit better', () => {
  assert.equal(imageOrientation(400, 1600, 186, 45), true);
  assert.equal(imageOrientation(1200, 800, 186, 95), false);
  assert.equal(imageOrientation(800, 1200, 186, 230), false);
  assert.equal(imageOrientation(1000, 1000, 186, 95), false);
});
