import { useState } from 'react';
import type { AdminUser } from '../types';

export function UserPicker({ users, value, onChange, all = false }: {
  users: AdminUser[]; value: string; onChange: (id: string) => void; all?: boolean;
}) {
  const [search, setSearch] = useState('');
  return <div className="user-picker flex-col gap-sm">
    <input type="search" aria-label="Search users" placeholder="Search name or description" value={search} onChange={(event) => setSearch(event.target.value)} />
    <select aria-label="Select user" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value={all ? 'all' : ''}>{all ? 'All users' : 'Choose a user…'}</option>
      {users.filter((u) => u.role !== 'admin' && (u.user_id === value || `${u.user_name} ${u.description ?? ''}`.toLowerCase().includes(search.toLowerCase()))).map((u) =>
        <option key={u.user_id} value={u.user_id}>{u.user_name}{u.is_active ? '' : ' (deactivated)'}{u.description ? ` · ${u.description}` : ''}</option>)}
    </select>
  </div>;
}
