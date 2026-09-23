// src/pages/Admin/AdminPage.tsx
import { useState } from 'react';
import type { AdminUser, FiltersState, Head, SidebarTab, StagedChange } from './types';
import { Sidebar } from './components/Sidebar';
import './AdminPage.css';

// TODO: point at the real endpoint once the backend route exists.
async function submitHeadChangesToServer(changes: StagedChange[]): Promise<void> {
  const response = await fetch('/api/admin/heads/batch-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes }),
  });
  if (!response.ok) throw new Error('Failed to apply head changes');
}

interface AdminPageProps {
  currentAdminUserId: string;
  users: AdminUser[];
  heads: Head[];
  onLogout: () => void;
}

export function AdminPage({ currentAdminUserId, users, heads, onLogout }: AdminPageProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('filters');
  const [filters, setFilters] = useState<FiltersState>({
    dateFrom: '',
    dateTo: '',
    userScope: 'all',
    direction: 'both',
  });

  function handleViewLedger(userId: string) {
    setFilters((prev) => ({ ...prev, userScope: userId }));
    // Ledger panel is out of scope here — it should read filters.userScope once built.
  }

  async function handleSubmitHeadChanges(changes: StagedChange[]) {
    await submitHeadChangesToServer(changes);
    // TODO: refetch heads from the server once this route is live.
  }

  function handleToggleUserActive(userId: string, nextActive: boolean) {
    // TODO: PATCH /api/admin/users/:id { is_active: nextActive }
    console.log('toggle active', userId, nextActive);
  }

  function handleDeleteUser(userId: string) {
    // NOTE: per the backend spec, users are never hard-deleted. This should
    // likely route to the same deactivate call, or the button should be
    // relabeled — flagging rather than guessing which one the client wants.
    console.log('delete user', userId);
  }

  function handleResetPassword(userId: string) {
    // TODO: POST /api/admin/users/:id/reset-password
    console.log('reset password', userId);
  }

  return (
    <div className="admin-page">
      <div className="admin-panel admin-panel--sidebar">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onLogout={onLogout}
          users={users}
          currentAdminUserId={currentAdminUserId}
          filters={filters}
          onFiltersChange={setFilters}
          heads={heads}
          onSubmitHeadChanges={handleSubmitHeadChanges}
          onViewLedger={handleViewLedger}
          onToggleUserActive={handleToggleUserActive}
          onDeleteUser={handleDeleteUser}
          onResetPassword={handleResetPassword}
        />
      </div>

      <div className="admin-panel admin-panel--ledger">
        {/* Ledger panel: separate spec, not part of this task. */}
      </div>
    </div>
  );
}