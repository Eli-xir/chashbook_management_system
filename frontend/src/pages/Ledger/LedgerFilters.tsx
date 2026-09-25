import { useState } from 'react';
import type { AdminUser, FiltersState, Head } from '../Admin/types';
import { UserPicker } from '../Admin/components/UserPicker';
import { Dialog } from '../Admin/components/Dialog';

export function LedgerFilters({ column, filters, heads, users, onChange }: {
  column: string; filters: FiltersState; heads: Head[]; users: AdminUser[]; onChange: (filters: FiltersState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = heads.find((h) => h.head_id === filters.headId);
  const active = column === 'Head' ? filters.headId != null : column === 'User' ? filters.userScope !== 'all'
    : column === 'Description' ? !!filters.description : !!(filters.dateFrom || filters.dateTo);
  function update(patch: Partial<FiltersState>) { onChange({ ...filters, ...patch }); }
  const today = new Date();
  const date = (year: number, month: number, day: number) => {
    const value = new Date(year, month, day);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  };
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
  const end = date(y, m, d);
  const ranges = [
    { label: 'Today', dateFrom: end, dateTo: end },
    { label: 'Yesterday', dateFrom: date(y, m, d - 1), dateTo: date(y, m, d - 1) },
    { label: 'Last 7 days', dateFrom: date(y, m, d - 6), dateTo: end },
    { label: 'This month', dateFrom: date(y, m, 1), dateTo: end },
    { label: 'Last month', dateFrom: date(y, m - 1, 1), dateTo: date(y, m, 0) },
    { label: 'This year', dateFrom: date(y, 0, 1), dateTo: end },
    { label: 'All dates', dateFrom: '', dateTo: '' },
  ];
  return <>
    <button className={`column-filter${active ? ' column-filter--active' : ''}`} onClick={() => { setOpen(true); setSearch(''); }}>{column === 'Head' && selected ? `Head · ${selected.head_name}` : column} ▾</button>
    {open && <Dialog title={`Filter · ${column}`} onClose={() => setOpen(false)}>
      {column === 'Head' ? <div className="flex-col gap-sm">
        <p>{selected?.head_name ?? 'All heads'}</p>
        <div className="flex-row gap-sm">
          <button className="btn" onClick={() => { update({ headId: null }); setOpen(false); }}>All heads</button>
          {selected && <button className="btn" onClick={() => update({ headId: selected.parent_head_id })}>↑ Parent</button>}
        </div>
        <input type="search" aria-label="Search heads" placeholder="Search heads or descriptions" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="filter-choices">{heads.filter((h) => h.parent_head_id === (filters.headId ?? null) && `${h.head_name} ${h.head_description ?? ''}`.toLowerCase().includes(search.toLowerCase())).map((h) =>
          <button className="btn" key={h.head_id} onClick={() => { update({ headId: h.head_id }); setOpen(false); }}>{h.head_name}{h.head_description && <small>{h.head_description}</small>}</button>)}
        {!heads.some((h) => h.parent_head_id === filters.headId) && selected && <p>No subheads.</p>}</div>
      </div> : column === 'User' ? <UserPicker users={users} value={filters.userScope} all onChange={(userScope) => { update({ userScope }); setOpen(false); }} />
        : column === 'Description' ? <label className="field"><span>Search descriptions</span><input type="search" value={filters.description ?? ''} onChange={(e) => update({ description: e.target.value })} /></label>
        : <div className="flex-col gap-md">
          <div className="date-presets" role="group" aria-label="Quick date ranges">{ranges.map(({ label, dateFrom, dateTo }) =>
            <button type="button" className="btn" key={label} aria-pressed={filters.dateFrom === dateFrom && filters.dateTo === dateTo}
              onClick={() => { update({ dateFrom, dateTo }); setOpen(false); }}>{label}</button>)}</div>
          <fieldset className="field"><legend>Custom dates</legend><div className="date-range-fields">
            {(['dateFrom', 'dateTo'] as const).map((key) => <label className="field" key={key}><span>{key === 'dateFrom' ? 'From' : 'To'}</span>
              <input type="date" value={filters[key]} min={key === 'dateTo' ? filters.dateFrom || undefined : undefined}
                max={key === 'dateFrom' ? filters.dateTo || undefined : undefined} onChange={(e) => update({ [key]: e.target.value })} /></label>)}
          </div></fieldset>
          {filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo && <p className="text-error" role="alert">From must be on or before To.</p>}
        </div>}
      <div className="flex-row justify-end gap-sm">
        <button className="btn" onClick={() => { update(column === 'Head' ? { headId: null } : column === 'User' ? { userScope: 'all' } : column === 'Description' ? { description: '' } : { dateFrom: '', dateTo: '' }); setOpen(false); }}>Clear</button>
        <button className="btn btn--primary" onClick={() => setOpen(false)}>Done</button>
      </div>
    </Dialog>}
  </>;
}
