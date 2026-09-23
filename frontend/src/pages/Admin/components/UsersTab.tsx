// src/pages/Admin/components/UsersTab.tsx
import { useState } from 'react';
import type { AdminUser } from '../types';
import './UsersTab.css';

interface UsersTabProps {
  currentAdminUserId: string;
  users: AdminUser[];
  onViewLedger: (userId: string) => void;
  onToggleActive: (userId: string, nextActive: boolean) => void;
  onDelete: (userId: string) => void;
  onResetPassword: (userId: string) => void;
}

export function UsersTab({
  currentAdminUserId,
  users,
  onViewLedger,
  onToggleActive,
  onDelete,
  onResetPassword,
}: UsersTabProps) {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const currentAdmin = users.find((u) => u.user_id === currentAdminUserId);
  const otherUsers = users.filter((u) => u.user_id !== currentAdminUserId);

  function toggleExpanded(userId: string) {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
  }

  return (
    <div className="users-tab flex-col gap-md">
      {currentAdmin && (
        <section className="flex-col gap-sm">
          <h3 className="section-label">Your account</h3>
          <UserCard user={currentAdmin} expanded isSelf onResetPassword={() => onResetPassword(currentAdmin.user_id)} />
        </section>
      )}

      <section className="flex-col gap-sm">
        <h3 className="section-label">All users</h3>
        <div className="flex-col gap-xs">
          {otherUsers.map((user) => (
            <UserCard
              key={user.user_id}
              user={user}
              expanded={expandedUserId === user.user_id}
              onClick={() => toggleExpanded(user.user_id)}
              onResetPassword={() => onResetPassword(user.user_id)}
              onViewLedger={() => onViewLedger(user.user_id)}
              onToggleActive={() => onToggleActive(user.user_id, !user.is_active)}
              onDelete={() => onDelete(user.user_id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

interface UserCardProps {
  user: AdminUser;
  expanded: boolean;
  isSelf?: boolean;
  onClick?: () => void;
  onResetPassword: () => void;
  onViewLedger?: () => void;
  onToggleActive?: () => void;
  onDelete?: () => void;
}

function UserCard({ user, expanded, isSelf, onClick, onResetPassword, onViewLedger, onToggleActive, onDelete }: UserCardProps) {
  return (
    <div className={`user-card ${expanded ? 'user-card--expanded' : ''} ${!user.is_active ? 'user-card--inactive' : ''}`}>
      <button type="button" className="user-card-header flex-row items-center justify-between" onClick={onClick} disabled={isSelf}>
        <span>{user.user_name}</span>
        {!user.is_active && <span className="head-node-badge">deactivated</span>}
      </button>

      {expanded && (
        <div className="user-card-body flex-col gap-sm">
          <div className="flex-col gap-xs">
            <div className="field-row">
              <span className="text-muted">Name</span>
              <span>{user.user_name}</span>
            </div>
            <div className="field-row">
              <span className="text-muted">Contact</span>
              <span>{user.contact_no ?? '—'}</span>
            </div>
          </div>

          <div className="flex-row gap-sm flex-wrap">
            <button type="button" className="btn btn--ghost" onClick={onResetPassword}>
              Reset password
            </button>
            {!isSelf && (
              <>
                <button type="button" className="btn btn--ghost" onClick={onViewLedger}>
                  View ledger
                </button>
                <button type="button" className="btn btn--ghost" onClick={onToggleActive}>
                  {user.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
                {/* See note in AdminPage.tsx re: hard-delete vs. deactivate-only backend rule */}
                <button type="button" className="btn btn--danger" onClick={onDelete}>
                  Delete user
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}