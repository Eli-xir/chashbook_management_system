import type { AdminUser, FiltersState, TransactionDirection } from '../types';

export function FiltersTab({ users, filters, onChange }: {
  users: AdminUser[]; filters: FiltersState; onChange: (filters: FiltersState) => void;
}) {
  function update<K extends keyof FiltersState>(key: K, value: FiltersState[K]) {
    onChange({ ...filters, [key]: value });
  }
  return (
    <div className="flex-col gap-md">
      <div className="field">
        <label htmlFor="date-from">Date from</label>
        <input id="date-from" type="date" value={filters.dateFrom} max={filters.dateTo || undefined}
          onChange={(event) => update('dateFrom', event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="date-to">Date to</label>
        <input id="date-to" type="date" value={filters.dateTo} min={filters.dateFrom || undefined}
          onChange={(event) => update('dateTo', event.target.value)} />
      </div>
      {filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo && (
        <p role="alert" className="text-error">The end date must be on or after the start date.</p>
      )}
      <div className="field">
        <label htmlFor="user-scope">User</label>
        <select id="user-scope" value={filters.userScope} onChange={(event) => update('userScope', event.target.value)}>
          <option value="all">All users</option>
          {users.map((user) => <option key={user.user_id} value={user.user_id}>{user.user_name}</option>)}
        </select>
      </div>
      <fieldset className="field">
        <legend>Direction</legend>
        <div className="segmented-control">
          {(['debit', 'credit', 'both'] as TransactionDirection[]).map((direction) => (
            <button key={direction} type="button" className="segmented-option" aria-pressed={filters.direction === direction}
              onClick={() => update('direction', direction)}>{direction[0].toUpperCase() + direction.slice(1)}</button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
