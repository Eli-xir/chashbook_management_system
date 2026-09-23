// src/pages/Admin/components/Sidebar.tsx
import type { AdminUser, FiltersState, Head, SidebarTab, StagedChange } from '../types';
import { FiltersTab } from './FiltersTab';
import { HeadsTab } from './HeadsTab';
import { UsersTab } from './UsersTab';
import './Sidebar.css';

interface SidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onLogout: () => void;
  users: AdminUser[];
  currentAdminUserId: string;
  filters: FiltersState;
  onFiltersChange: (filters: FiltersState) => void;
  heads: Head[];
  onSubmitHeadChanges: (changes: StagedChange[]) => Promise<void>;
  onViewLedger: (userId: string) => void;
  onToggleUserActive: (userId: string, nextActive: boolean) => void;
  onDeleteUser: (userId: string) => void;
  onResetPassword: (userId: string) => void;
}

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'filters', label: 'Filters' },
  { id: 'heads', label: 'Heads' },
  { id: 'users', label: 'Users' },
];

export function Sidebar(props: SidebarProps) {
  const { activeTab, onTabChange, onLogout } = props;

  return (
    <div className="sidebar flex-col">
      <div className="sidebar-nav flex-row items-center justify-between">
        <div className="sidebar-tabs flex-row">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`sidebar-tab ${activeTab === tab.id ? 'sidebar-tab--active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--ghost" onClick={onLogout}>
          Logout
        </button>
      </div>

      <div className="sidebar-content">
        {activeTab === 'filters' && (
          <FiltersTab users={props.users} filters={props.filters} onChange={props.onFiltersChange} />
        )}
        {activeTab === 'heads' && (
          <HeadsTab heads={props.heads} onSubmitChanges={props.onSubmitHeadChanges} />
        )}
        {activeTab === 'users' && (
          <UsersTab
            currentAdminUserId={props.currentAdminUserId}
            users={props.users}
            onViewLedger={props.onViewLedger}
            onToggleActive={props.onToggleUserActive}
            onDelete={props.onDeleteUser}
            onResetPassword={props.onResetPassword}
          />
        )}
      </div>
    </div>
  );
}