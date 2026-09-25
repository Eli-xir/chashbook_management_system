import { useEffect, useState } from 'react';
import type { AdminUser, FiltersState, Head, Transaction } from '../Admin/types';
import { cashbookApi } from '../../data/cashbookApi';
import { direction, headBranchIds, headPath, ledgerReport, money } from './ledgerModel';
import type { LedgerOrder } from './ledgerModel';
import { ReportActions } from './ReportActions';
import type { ReportDocument } from './ledgerExport';
import { TransactionCard } from './TransactionCard';
import { UserPreview } from '../Admin/components/UserPreview';
import { Dialog } from '../Admin/components/Dialog';
import './Ledger.css';
import { LedgerFilters } from './LedgerFilters';
import { UserPicker } from '../Admin/components/UserPicker';

type LedgerData = Awaited<ReturnType<typeof cashbookApi.ledger>>;
const filterKey = (filters: FiltersState) => JSON.stringify([
  filters.dateFrom, filters.dateTo, filters.userScope, filters.direction, filters.headId ?? null, filters.description ?? '',
]);
export function Ledger({ filters, revision, heads, users, onDirtyChange, onFilterChange, company = false, onChanged }: {
  onChanged: () => Promise<void>; company?: boolean; onFilterChange: (filters: FiltersState) => void;
  filters: FiltersState; revision: number; heads: Head[]; users: AdminUser[]; onDirtyChange: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<LedgerData | null>(null);
  const [order, setOrder] = useState<LedgerOrder>('by-time');
  const [pagination, setPagination] = useState({ scope: '', page: 0 });
  const scope = filterKey(filters);
  const [draft, setDraft] = useState({ scope, filters });
  const draftFilters = draft.scope === scope ? draft.filters : filters;
  const pendingFilters = filterKey(draftFilters) !== scope;
  const invalidDraftDates = !!draftFilters.dateFrom && !!draftFilters.dateTo && draftFilters.dateFrom > draftFilters.dateTo;
  function stageFilters(next: FiltersState) { setDraft({ scope, filters: next }); }
  function applyFilters() {
    if (!pendingFilters || invalidDraftDates) return;
    onFilterChange(draftFilters);
    setPagination({ scope: filterKey(draftFilters), page: 0 });
  }
  const page = pagination.scope === scope ? pagination.page : 0;
  function setPage(next: number) { setPagination({ scope, page: next }); }
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [crediting, setCrediting] = useState(false);
  const [creditUserId, setCreditUserId] = useState('');
  const [creditDirty, setCreditDirty] = useState(false);
  const [creditBusy, setCreditBusy] = useState(false);
  const [confirmCreditClose, setConfirmCreditClose] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [showInactive, setShowInactive] = useState(false);
  useEffect(() => { onDirtyChange(selected !== null || creditDirty); return () => onDirtyChange(false); }, [selected, creditDirty, onDirtyChange]);
  function closeCredit() {
    if (creditBusy) return;
    if (creditDirty) setConfirmCreditClose(true);
    else setCrediting(false);
  }
  const creditUser = data?.users.find((user) => user.user_id === creditUserId && user.is_active && user.role !== 'admin');
  useEffect(() => {
    let ignore = false;
    cashbookApi.ledger().then((result) => { if (!ignore) { setData(result); setError(''); } })
      .catch((error) => { if (!ignore) setError(error instanceof Error ? error.message : 'Could not load ledger.'); });
    return () => { ignore = true; };
  }, [revision, reload, heads, users]);
  async function refresh() { setData(await cashbookApi.ledger()); await onChanged(); }
  const reportHeads = data?.heads ?? heads;
  const entryDirection = (entry: Transaction) => direction(entry, company);
  const report = ledgerReport(data?.transactions ?? [], filters, order, reportHeads, company);
  const branch = headBranchIds(reportHeads, filters.headId);
  const pageCount = Math.max(1, Math.ceil(report.rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const userName = (id: string) => data?.users.find((user) => user.user_id === id)?.user_name ?? 'Unavailable account';
  const title = company ? 'Company Statement' : filters.userScope === 'all' ? 'Users Statement' : userName(filters.userScope);
  const receivedLabel = `Total received by ${filters.userScope === 'all' ? 'users' : userName(filters.userScope)}`;
  const branchLabel = filters.headId == null ? '' : `${headPath(reportHeads, filters.headId)} · Includes subheads`;
  const dateLabel = filters.dateFrom && filters.dateTo ? `${filters.dateFrom} to ${filters.dateTo}`
    : filters.dateFrom ? `From ${filters.dateFrom}` : filters.dateTo ? `Through ${filters.dateTo}` : '';
  const subtitle = [branchLabel, dateLabel, company && filters.userScope !== 'all' ? userName(filters.userScope) : '', filters.description ? `Description: ${filters.description}` : ''].filter(Boolean).join(' · ');
  const columns = ['Date/time', 'User', 'Entered by', 'Head', 'Description', 'Credit', 'Debit', 'Balance'];
  const entryCells = (entry: Transaction, balance: number): (string | number)[] => [
    new Date(entry.createdAt).toLocaleString(), userName(entry.userId), userName(entry.createdBy),
    entry.headPath ?? headPath(data?.heads ?? [], entry.headId), entry.description ?? '',
    entryDirection(entry) === 'credit' ? entry.amount : '', entryDirection(entry) === 'debit' ? entry.amount : '', balance,
  ];
  const totalCells = (label: string, balance: number, credit: number | string = '', debit: number | string = ''): (string | number)[] => [label, '', '', '', '', credit, debit, balance];
  function pageRows(index: number) {
    const start = index * pageSize, rows: { cells: (string | number)[]; entry?: Transaction }[] = [];
    const total = (label: string, balance: number, credit: string | number = '', debit: string | number = '') => rows.push({ cells: totalCells(label, balance, credit, debit) });
    total(index === 0 ? 'Balance brought forward' : 'Page brought forward', start ? report.rows[start - 1].balance : report.opening);
    report.rows.slice(start, start + pageSize).forEach(({ entry, balance }, offset) => {
      const position = start + offset, type = entryDirection(entry);
      if (order !== 'by-time' && (offset === 0 || entryDirection(report.rows[position - 1].entry) !== type)) {
        total(`${type === 'credit' ? 'Credits' : 'Debits'}${offset === 0 && start && entryDirection(report.rows[position - 1].entry) === type ? ' (continued)' : ''}`, balance - (type === 'credit' ? entry.amount : -entry.amount));
      }
      rows.push({ cells: entryCells(entry, balance), entry });
      if (order !== 'by-time' && (!report.rows[position + 1] || entryDirection(report.rows[position + 1].entry) !== type)) {
        total(`${type === 'credit' ? 'Credits' : 'Debits'} subtotal`, balance, type === 'credit' ? report.credit : '', type === 'debit' ? report.debit : '');
      }
    });
    const ending = report.rows[Math.min(start + pageSize, report.rows.length) - 1]?.balance ?? report.opening;
    total(index === pageCount - 1 ? 'Totals / closing balance' : 'Page carried forward', ending,
      index === pageCount - 1 ? report.credit : '', index === pageCount - 1 ? report.debit : '');
    if (index === pageCount - 1) {
      Object.entries(summary).forEach(([label, value]) => total(label, value));
    }
    return rows;
  }
  function exportReport(): ReportDocument {
    return { title, subtitle, columns, pages: Array.from({ length: pageCount }, (_, index) => pageRows(index).map((row) => row.cells)) };
  }
  const summary = company ? { Credits: report.totalBillPayment, Debits: report.totalReceived, Balance: report.remainingPayable }
    : { [receivedLabel]: report.totalReceived, 'Total paid': report.totalBillPayment, 'Remaining balance': -report.remainingPayable };
  const invalidDates = !!filters.dateFrom && !!filters.dateTo && filters.dateFrom > filters.dateTo;
  return <div className="ledger-view flex-col gap-md">
    <div className="flex-row flex-wrap items-center justify-between gap-sm"><h1>{title}</h1>
      <button className="btn btn--primary" disabled={!data} onClick={() => {
        setCreditUserId(filters.userScope === 'all' ? '' : filters.userScope); setCreditDirty(false); setCrediting(true);
      }}>Credit a user</button></div>
    {(subtitle || filters.description || filters.userScope !== 'all') && <div className="active-filters flex-row flex-wrap gap-sm"><span>{[subtitle, !company && filters.userScope !== 'all' ? userName(filters.userScope) : ''].filter(Boolean).join(' · ')}</span></div>}
    <div className="ledger-toolbar flex-row flex-wrap gap-sm">
      <label className="field"><span>Entries</span><select value={draftFilters.direction} onChange={(event) => stageFilters({ ...draftFilters, direction: event.target.value as FiltersState['direction'] })}><option value="both">Credits & debits</option><option value="credit">Credits</option><option value="debit">Debits</option></select></label>
      <label className="field"><span>Arrangement</span><select value={order} onChange={(event) => { setOrder(event.target.value as LedgerOrder); setPage(0); }}>
        <option value="by-time">Default</option><option value="credit-first">Credits, then debits</option><option value="debit-first">Debits, then credits</option>
      </select></label>
      <label className="field"><span>Rows per page</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}>
        {[10, 20, 50, 100].map((size) => <option key={size}>{size}</option>)}
      </select></label>
      <ReportActions disabled={!data || invalidDates} getReport={exportReport} />
      <button className={`btn${pendingFilters ? ' btn--primary filter-apply--pending' : ''}`} disabled={!pendingFilters || invalidDraftDates} onClick={applyFilters}>Apply filters</button>
      <button className="btn" onClick={() => stageFilters({ dateFrom: '', dateTo: '', userScope: 'all', direction: 'both' })}>Clear filters</button>
      {pendingFilters && <button className="btn" onClick={() => stageFilters(filters)}>Discard changes</button>}
    </div>
    {pendingFilters && <p className={invalidDraftDates ? 'text-error' : 'text-muted'} role="status">{invalidDraftDates ? 'Choose an end date on or after the start date.' : 'Filter changes ready to apply.'}</p>}
    {error && <p role="alert" className="text-error">{error} <button className="btn" onClick={() => setReload((value) => value + 1)}>Reload</button></p>}
    {invalidDates ? <p role="alert">Choose an end date on or after the start date.</p> : !data ? <p>Loading ledger…</p> : <>
      <dl className="ledger-totals">
        {Object.entries(summary).map(([label, value]) => <div key={label}
          >
          <dt>{label}</dt><dd>{money(value)}</dd></div>)}
      </dl>
      <div className="ledger-table-scroll"><table className="ledger-table"><thead><tr>{columns.map((label) => <th key={label}
        title={label === 'Balance' ? 'Opening balance plus credits minus debits in the displayed order.' : undefined}>{['Date/time', 'User', 'Head', 'Description'].includes(label) ? <LedgerFilters column={label} filters={draftFilters} heads={reportHeads} users={data.users} onChange={stageFilters} /> : label}</th>)}</tr></thead><tbody>
        {pageRows(currentPage).map(({ cells, entry: rowEntry }, index) => {
          return <tr key={rowEntry ? `transaction:${rowEntry.id}` : `total:${index}`} className={rowEntry ? 'ledger-entry' : 'ledger-total'} onClick={() => { if (rowEntry) setSelected(rowEntry); }}>
            {cells.map((value, column) => <td key={column}>{column === 0 && rowEntry ? <button className="ledger-row-link" onClick={() => setSelected(rowEntry)}>{value}</button> : typeof value === 'number' ? money(value) : value}</td>)}
          </tr>;
        })}
      </tbody></table></div>
      {!report.rows.length && <p className="text-muted">No entries in this selection.</p>}
      <div className="flex-row items-center justify-between gap-sm">
        <button className="btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span>Page {currentPage + 1} / {pageCount} · {report.rows.length} entries</span>
        <button className="btn" disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
      </div>
      <details className="disclosure" open={showInactive} onToggle={(event) => setShowInactive(event.currentTarget.open)}><summary>Deactivated entries</summary>
        {data.transactions.filter((entry) => !entry.active && (filters.userScope === 'all' || entry.userId === filters.userScope) && (!branch || branch.has(entry.headId))).map((entry) =>
          <button className="btn" key={entry.id} onClick={() => setSelected(entry)}>{new Date(entry.createdAt).toLocaleString()} · {userName(entry.userId)} · {money(entry.amount)}</button>)}
      </details>
    </>}
    {selected && data && <TransactionCard key={selected.id} entry={selected}
      admin company={company} heads={data.heads} users={data.users}
      onClose={() => { setSelected(null); setReload((value) => value + 1); }} onChanged={refresh} />}
    {crediting && data && <Dialog title="Credit a user" onClose={closeCredit} busy={creditBusy}>
      {creditUser ? <UserPreview key={creditUser.user_id} user={creditUser} heads={data.heads} assigned={[]} pending={false}
        adminCredit onClose={closeCredit} onDirtyChange={setCreditDirty} onBusyChange={setCreditBusy}
        onSubmitted={async () => { await refresh(); setCrediting(false); }} /> : <div className="flex-col gap-md">
        <p>Choose the user receiving this credit.</p>
        <UserPicker users={data.users.filter((u) => u.is_active)} value={creditUserId} onChange={setCreditUserId} />
        {!data.users.some((user) => user.is_active && user.role !== 'admin') && <p className="text-muted">Create an active user first.</p>}
        <button className="btn" onClick={closeCredit}>Cancel</button>
      </div>}
    </Dialog>}
    {confirmCreditClose && <Dialog title="Discard this credit draft?" onClose={() => setConfirmCreditClose(false)}>
      <p>The credit has not been sent.</p>
      <div className="flex-row justify-end gap-sm">
        <button className="btn" onClick={() => setConfirmCreditClose(false)}>Keep editing</button>
        <button className="btn btn--primary" onClick={() => { setConfirmCreditClose(false); setCrediting(false); setCreditDirty(false); }}>Discard</button>
      </div>
    </Dialog>}
  </div>;
}
