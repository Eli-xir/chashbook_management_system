import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentTransactions, attachmentPdf, imageOrientation, expandImageSlots } from '../src/pages/Ledger/attachmentReport.ts';
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

test('Spare page height grows images without growing text-only entries or crossing totals', () => {
  const slots = [{ height: 60, imageHeight: 40 }, { height: 20, imageHeight: 0 }, { height: 60, imageHeight: 40 }];
  assert.deepEqual(expandImageSlots(slots, 240), [90, 0, 90]);
  assert.deepEqual(expandImageSlots(slots, 140), [40, 0, 40]);
  assert.deepEqual(expandImageSlots([{ height: 20, imageHeight: 0 }], 240), [0]);
});


test('Images-only PDF contains images but no ledger text, with one batch request', async () => {
  const source = `data:image/jpeg;base64,${readFileSync(new URL('../src/assets/logo.jpeg', import.meta.url)).toString('base64')}`;
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: class {
    naturalWidth = 100; naturalHeight = 100; async decode() {}
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage() {}, translate() {}, rotate() {} }), toDataURL: () => source }),
  } });
  try {
    let calls = 0;
    const file = await attachmentPdf([{ entry: base, cells: ['Private date', 'Private user', 'Private admin', 'Private head', 'Private description', 100, '', 100] }], document, 2,
      async (ids) => { calls++; assert.deepEqual(ids, ['1']); return { '1': source }; }, true);
    const content = await file.text();
    assert.equal(calls, 1);
    assert.equal(file.name, 'attachments.pdf');
    assert.match(content, /\/Subtype \/Image/);
    assert.doesNotMatch(content, /Private|PKR|Credit|Debit|Balance|SOHAIL|Printed:|Test statement|From:/);
  } finally {
    if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage); else Reflect.deleteProperty(globalThis, 'Image');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});
