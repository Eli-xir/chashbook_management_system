import type { ReactNode } from 'react';
import type { SidebarTab } from '../types';
import './Sidebar.css';

const tabs: SidebarTab[] = ['users', 'filters', 'heads'];

export function Sidebar({ activeTab, onTabChange, onLogout, onRefresh, refreshing, children }: {
  activeTab: SidebarTab; onTabChange: (tab: SidebarTab) => void;
  onLogout: () => void; children: ReactNode;
  onRefresh: () => void; refreshing: boolean;
}) {
  return (
    <aside className="sidebar flex-col">
      <nav className="sidebar-nav flex-row items-center justify-between" aria-label="Admin controls">
        <div className="sidebar-tabs flex-row">
          {tabs.map((tab) => (
            <button key={tab} type="button" aria-controls={`panel-${tab}`}
              aria-current={activeTab === tab ? 'page' : undefined}
              className={`sidebar-tab ${activeTab === tab ? 'sidebar-tab--active' : ''}`}
              onClick={() => onTabChange(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>
          ))}
        </div>
        <div className="flex-row gap-sm">
          <button type="button" className="btn" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="btn" onClick={onLogout}>Logout</button>
        </div>
      </nav>
      <div className="sidebar-content">{children}</div>
    </aside>
  );
}
