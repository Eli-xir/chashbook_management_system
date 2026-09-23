// src/pages/Admin/components/FiltersTab.tsx
import type { AdminUser, FiltersState, TransactionDirection } from '../types';

interface FiltersTabProps {
  users: AdminUser[];
  filters: FiltersState;
  onChange: (filters: FiltersState) => void;
}

export function FiltersTab({ users, filters, onChange }: FiltersTabProps) {
  function update<K extends keyof FiltersState>(key: K, value: FiltersState[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="filters-tab flex-col gap-md">
      <div className="field">
        <label htmlFor="date-from">From</label>
        <input id="date-from" type="date" value={filters.dateFrom} onChange={(e) => update('dateFrom', e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="date-to">To</label>
        <input id="date-to" type="date" value={filters.dateTo} onChange={(e) => update('dateTo', e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="user-scope">User</label>
        <select id="user-scope" value={filters.userScope} onChange={(e) => update('userScope', e.target.value)}>
          <option value="all">All users</option>
          {users.map((user) => (
            <option key={user.user_id} value={user.user_id}>
              {user.user_name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Direction</label>
        <div className="segmented-control">
          {(['debit', 'credit', 'both'] as TransactionDirection[]).map((direction) => (
            <button
              key={direction}
              type="button"
              className={`segmented-option ${filters.direction === direction ? 'segmented-option--active' : ''}`}
              onClick={() => update('direction', direction)}
            >
              {direction === 'both' ? 'Both' : direction[0].toUpperCase() + direction.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}