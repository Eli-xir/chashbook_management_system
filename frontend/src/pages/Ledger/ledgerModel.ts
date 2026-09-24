import type { FiltersState, Head, Transaction, TransactionRevision } from '../Admin/types';

export const money = (amount: number) => `PKR ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
export const direction = (entry: Transaction) => entry.createdBy === entry.userId ? 'debit' : 'credit';
export function accountTotals(entries: Transaction[]) {
  let totalReceived = 0, totalBillPayment = 0;
  for (const entry of entries) {
    if (!entry.active) continue;
    if (direction(entry) === 'credit') totalReceived = roundMoney(totalReceived + entry.amount);
    else totalBillPayment = roundMoney(totalBillPayment + entry.amount);
  }
  return { totalReceived, totalBillPayment, remainingPayable: roundMoney(totalBillPayment - totalReceived) };
}
export function headPath(heads: Head[], id: number) {
  const names: string[] = [], seen = new Set<number>();
  let head = heads.find((item) => item.head_id === id);
  while (head && !seen.has(head.head_id)) {
    seen.add(head.head_id); names.unshift(head.head_name);
    head = heads.find((item) => item.head_id === head?.parent_head_id);
  }
  return names.join(' / ') || 'Unavailable head';
}
export function historyOf(entry: Transaction): TransactionRevision[] {
  return entry.versions?.length ? entry.versions : [{
    versionId: `${entry.id}-initial`, recordedAt: entry.createdAt, editorId: entry.createdBy,
    action: 'Created', amount: entry.amount, headId: entry.headId, categoryId: entry.categoryId,
    transactionTypeId: entry.transactionTypeId, attachments: entry.attachments, active: entry.active,
    headPath: entry.headPath, categoryName: entry.categoryName,
  }];
}
export type LedgerOrder = 'chronological' | 'credit-first' | 'debit-first';
export function headBranchIds(heads: Head[], headId: number | null | undefined): Set<number> | null {
  if (headId == null) return null;
  const children = new Map<number, number[]>();
  for (const head of heads) {
    if (head.parent_head_id !== null) children.set(head.parent_head_id, [...(children.get(head.parent_head_id) ?? []), head.head_id]);
  }
  const ids = new Set<number>(), pending = [headId];
  while (pending.length) {
    const id = pending.pop()!;
    if (ids.has(id)) continue;
    ids.add(id); pending.push(...(children.get(id) ?? []));
  }
  return ids;
}
export function ledgerReport(entries: Transaction[], filters: FiltersState, order: LedgerOrder, heads: Head[] = []) {
  const day = (value: string) => {
    const d = new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const signed = (entry: Transaction) => direction(entry) === 'credit' ? entry.amount : -entry.amount;
  const branch = headBranchIds(heads, filters.headId);
  const account = entries.filter((entry) => entry.active && (filters.userScope === 'all' || entry.userId === filters.userScope)
    && (!branch || branch.has(entry.headId)));
  const selected = account.filter((entry) => filters.direction === 'both' || direction(entry) === filters.direction);
  const opening = selected.filter((entry) => filters.dateFrom && day(entry.createdAt) < filters.dateFrom).reduce((sum, entry) => roundMoney(sum + signed(entry)), 0);
  const period = selected.filter((entry) => (!filters.dateFrom || day(entry.createdAt) >= filters.dateFrom) && (!filters.dateTo || day(entry.createdAt) <= filters.dateTo));
  period.sort((a, b) => {
    if (order !== 'chronological' && direction(a) !== direction(b)) return direction(a) === (order === 'credit-first' ? 'credit' : 'debit') ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
  let balance = opening;
  const rows = period.map((entry) => ({ entry, balance: balance = roundMoney(balance + signed(entry)) }));
  const credit = period.filter((entry) => direction(entry) === 'credit').reduce((sum, entry) => roundMoney(sum + entry.amount), 0);
  const debit = period.filter((entry) => direction(entry) === 'debit').reduce((sum, entry) => roundMoney(sum + entry.amount), 0);
  const totals = accountTotals(account.filter((entry) => !filters.dateTo || day(entry.createdAt) <= filters.dateTo));
  return { rows, opening, credit, debit, closing: balance, ...totals };
}
