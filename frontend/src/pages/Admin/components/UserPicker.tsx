import { useState } from 'react';
import type { AdminUser } from '../types';
import { matchesUser } from '../utils/userProfile';

export function UserPicker({ users, value, onChange, all = false, selectedIds }: {
  users: AdminUser[]; value?: string; onChange: (id: string) => void; all?: boolean; selectedIds?: string[];
}) {
  const [search, setSearch] = useState('');
  const choices = users.filter((u) => u.role !== 'admin' && matchesUser(u, search));
  function select(id: string) { onChange(id); if (!selectedIds) setSearch(''); }
  const selected = (id: string) => selectedIds ? selectedIds.includes(id) : value === id;
  return <div className="user-picker flex-col gap-sm">
    <input type="search" name="user-search" autoComplete="off" aria-label="Search users" placeholder="Search name, description or contact" value={search} onChange={(event) => setSearch(event.target.value)}
      onKeyDown={(event) => { if (event.key === 'Enter' && choices.length === 1) { event.preventDefault(); select(choices[0].user_id); } }} />
    <div className="user-picker-results flex-col gap-xs" role="group" aria-label="Select user">
      {!selectedIds && <button type="button" className="btn user-picker-choice" aria-pressed={value === (all ? 'all' : '')} onClick={() => select(all ? 'all' : '')}>{all ? 'All users' : 'No user selected'}</button>}
      {choices.map((u) => <button type="button" className="btn user-picker-choice" key={u.user_id} aria-pressed={selected(u.user_id)} onClick={() => select(u.user_id)}>
        <span>{u.user_name}{u.is_active ? '' : ' (deactivated)'}{selected(u.user_id) && ' ✓'}</span>
        {u.description && <small className="text-muted">{u.description}</small>}
      </button>)}
      {!choices.length && <p className="text-muted" role="status">No matching users.</p>}
    </div>
  </div>;
}
