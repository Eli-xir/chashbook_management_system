import type { AdminData, MockData } from '../pages/Admin/types';

const key = 'cashbook.admin.v1';
const initial: AdminData = {
  heads: [], permissions: {},
  users: [{ user_id: 'admin-1', user_name: 'Sohail Malik', contacts: ['0300-0000000'], is_active: true }],
};

export function readAdminData(): MockData {
  const saved = localStorage.getItem(key);
  if (saved) {
    const data = JSON.parse(saved) as AdminData;
    if (!Array.isArray(data.heads) || !Array.isArray(data.users) || !data.permissions || typeof data.permissions !== 'object') {
      throw new Error('Saved admin data could not be read.');
    }
    return { ...data, transactions: (data as MockData).transactions ?? [] };
  }
  // Preserve heads saved by the previous frontend.
  const heads = JSON.parse(localStorage.getItem('cashbook.heads.v1') ?? '[]');
  return { ...initial, heads: Array.isArray(heads) ? heads : [], transactions: [] };
}

export function saveAdminData(data: AdminData) {
  // Local prototype data only; credentials never belong in this store.
  localStorage.setItem(key, JSON.stringify(data));
}
