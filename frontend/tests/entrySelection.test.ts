import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleEntry, selectedEntriesReport } from '../src/pages/Ledger/entrySelection.ts';
import type { EvidenceRecord } from '../src/pages/Ledger/attachmentReport.ts';
import { attachmentPdf } from '../src/pages/Ledger/attachmentReport.ts';

test('Toggling deselects an entry without losing selections on other pages', () => {
  const original = new Set(['first', 'last']);
  const ids = ['first', 'middle', 'last'];
  assert.deepEqual([...toggleEntry(original, 'first', ids, null, false)], ['last']);
  assert.deepEqual([...original], ['first', 'last']);
  assert.deepEqual([...toggleEntry(original, 'middle', ids, null, false)], ['first', 'last', 'middle']);
});

test('Ranges work forward and backward across pages and include both endpoints', () => {
  const ids = Array.from({ length: 45 }, (_, index) => String(index));
  for (const [anchor, end] of [['3', '42'], ['42', '3']]) {
    const result = toggleEntry(new Set(['0']), end, ids, anchor, true);
    assert.equal(result.size, 41);
    assert.ok(result.has('0'));
    assert.deepEqual([...result].slice(1), ids.slice(3, 43));
  }
  assert.deepEqual([...toggleEntry(new Set(), '4', ids, 'removed', true)], ['4']);
});

test('Starting a range on an already selected entry keeps it selected, including after cancelling the range', () => {
  const ids = ['first', 'middle', 'last'];
  const started = toggleEntry(new Set(['first']), 'first', ids, null, true);
  assert.deepEqual([...started], ['first']);
  assert.deepEqual([...toggleEntry(started, 'last', ids, 'first', true)], ids);
  // Cancelling range mode leaves the chosen start selected; a normal tap can deselect it.
  assert.deepEqual([...toggleEntry(started, 'first', ids, null, false)], []);
  assert.deepEqual([...toggleEntry(started, 'first', ids, 'removed', true)], ['first']);
});

test('Selected export includes only supplied entries with independent totals and no account balance', () => {
  const record = (id: string, credit: number | string, debit: number | string): EvidenceRecord => ({
    entry: { id, userId: 'user', createdBy: 'user', headId: null, amount: 1, active: true, createdAt: '2026-10-15T12:00:00Z', attachments: [] },
    cells: ['date', 'user', 'admin', 'head', id, credit, debit, 9999],
  });
  const records = [record('chosen-a', 100, ''), record('chosen-b', '', 30.25), record('chosen-c', 0.1, '')];
  const report = selectedEntriesReport(records, {
    title: 'Company Statement', subtitle: 'From: 2026-10-15', columns: ['Date/time', 'User', 'Entered by', 'Head', 'Description', 'Credit', 'Debit', 'Balance'], pages: [],
  }, 2);
  assert.deepEqual(report.records.map(({ entry }) => entry.id), ['chosen-a', 'chosen-b', 'chosen-c']);
  assert.deepEqual(report.records.map(({ cells }) => cells[7]), [100, 69.75, 69.85]);
  assert.equal(report.document.pages.length, 2);
  assert.equal(report.document.columns[7], 'Selected net');
  assert.match(report.document.subtitle, /not the account balance/);
  assert.deepEqual(report.document.pages.at(-1)?.at(-1), ['Selected entries totals / net', '', '', '', '', 100.1, 30.25, 69.85]);
  assert.ok(!report.document.pages.flat(2).includes(9999));
  assert.equal(records[0].cells[7], 9999);
});

test('Selected attachments PDF labels the selected net and exports only selected transaction details', async () => {
  const entry = { id: 'chosen', userId: 'user', createdBy: 'user', headId: null, amount: 25, active: true, createdAt: '2026-10-15T12:00:00Z', attachments: [] };
  const report = selectedEntriesReport([{ entry, cells: ['date', 'user', 'admin', 'head', 'Chosen receipt', '', 25, 9999] }], {
    title: 'Users Statement', subtitle: '', columns: ['Date/time', 'User', 'Entered by', 'Head', 'Description', 'Credit', 'Debit', 'Balance'], pages: [],
  }, 20);
  const file = await attachmentPdf(report.records, report.document, 2, async () => ({}));
  const contents = await file.text();
  assert.match(contents, /Chosen receipt/);
  assert.match(contents, /Selected net: PKR -25/);
  assert.match(contents, /not the account balance/);
  assert.doesNotMatch(contents, /PKR (?:9,999|9999)/);
});
