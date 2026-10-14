import type { EvidenceRecord } from './attachmentReport.ts';
import type { ReportDocument } from './ledgerExport.ts';
import { roundMoney } from './ledgerModel.ts';

export function toggleEntry(ids: Set<string>, id: string, orderedIds: string[], anchor: string | null, range: boolean) {
  const next = new Set(ids);
  const start = anchor === null ? -1 : orderedIds.indexOf(anchor), end = orderedIds.indexOf(id);
  if (range && start >= 0 && end >= 0) {
    orderedIds.slice(Math.min(start, end), Math.max(start, end) + 1).forEach((value) => next.add(value));
  } else if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectedEntriesReport(records: EvidenceRecord[], document: ReportDocument, pageSize: number) {
  let credit = 0, debit = 0;
  const selectedRecords = records.map(({ entry, cells }) => {
    credit = roundMoney(credit + (typeof cells[5] === 'number' ? cells[5] : 0));
    debit = roundMoney(debit + (typeof cells[6] === 'number' ? cells[6] : 0));
    return { entry, cells: [...cells.slice(0, 7), roundMoney(credit - debit)] };
  });
  const pages: ReportDocument['pages'] = [];
  for (let start = 0; start < selectedRecords.length; start += pageSize) {
    pages.push(selectedRecords.slice(start, start + pageSize).map(({ cells }) => cells));
  }
  if (pages.length) {
    pages[0].unshift(['Selected entries opening (zero)', '', '', '', '', '', '', 0]);
    pages.at(-1)!.push(['Selected entries totals / net', '', '', '', '', credit, debit, roundMoney(credit - debit)]);
  }
  return { records: selectedRecords, document: {
    ...document, title: `${document.title} · Selected entries`,
    subtitle: [document.subtitle, `${records.length} selected entries · Net reflects selected entries only; not the account balance.`].filter(Boolean).join(' · '),
    columns: [...document.columns.slice(0, 7), 'Selected net'], pages,
  } };
}
