import { useState } from 'react';
import type { CashbookData, AdminUser, CreateUserInput, FiltersState, Head, StagedChange, UserAction, UserProfile } from './types';
import { HeadsTab } from './components/HeadsTab';
import { UsersTab } from './components/UsersTab';
import { PermissionChanges } from './components/PermissionChanges';
import { UserPreview } from './components/UserPreview';
import { UserPicker } from './components/UserPicker';
import { Dialog } from './components/Dialog';
import { usePermissionChanges } from './hooks/usePermissionChanges';
import { permissionDiff } from './utils/permissions';
import { Ledger } from '../Ledger/Ledger';
import { accountTotals, money } from '../Ledger/ledgerModel';
import logo from '../../assets/logo.jpeg';
import './AdminPage.css';

interface AdminPageProps extends CashbookData {
  currentAdminUserId: string;
  onLogout: () => void;
  onRefresh: () => Promise<void>;
  onSubmitHeadChanges: (changes: StagedChange[]) => Promise<Head[]>;
  onSavePermissions: (userId: string, ids: number[]) => Promise<number[]>;
  onSaveProfile: (userId: string, profile: UserProfile) => Promise<void>;
  onCreateUser: (input: CreateUserInput) => Promise<AdminUser>;
  onChangePassword?: (userId: string, password: string) => Promise<void>;
  onUserAction?: (userId: string, action: UserAction) => Promise<void>;
}
const cards = [
  { id: 'users', title: 'Users', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', tone: 'blue' },
  { id: 'company', title: 'Company Statement', icon: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M10 21v-4h4v4', tone: 'gold' },
  { id: 'statement', title: 'Users Statement', icon: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h2', tone: 'green' },
  { id: 'heads', title: 'Heads Management', icon: 'M3 6h6l2 2h10v12H3zM3 6V4h6l2 2M8 12h8M8 16h5', tone: 'purple' },
] as const;
type Page = 'home' | typeof cards[number]['id'];
export function AdminPage(props: AdminPageProps) {
  const { users, heads, permissions, currentAdminUserId } = props;
  const [page, setPage] = useState<Page>('home');
  const [filters, setFilters] = useState<FiltersState>({ dateFrom: '', dateTo: '', userScope: 'all', direction: 'both' });
  const [selectedUserId, setSelectedUserId] = useState('');
  const [showPermissions, setShowPermissions] = useState(false);
  const [preview, setPreview] = useState(false);
  const [headDirty, setHeadDirty] = useState(false);
  const [userDirty, setUserDirty] = useState(false);
  const [ledgerDirty, setLedgerDirty] = useState(false);
  const [transactionDirty, setTransactionDirty] = useState(false);
  const [transactionBusy, setTransactionBusy] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [revision, setRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [notice, setNotice] = useState('');
  const [headAction, setHeadAction] = useState<{ head: Head; action: 'give' | 'revoke' } | null>(null);
  const [actionUser, setActionUser] = useState('');
  const editor = usePermissionChanges(permissions, heads);
  const selectableUsers = users.filter((u) => u.user_id !== currentAdminUserId && u.role !== 'admin');
  const selectedUser = selectableUsers.find((u) => u.user_id === selectedUserId);
  const dirty = headDirty || userDirty || editor.dirty || transactionDirty || ledgerDirty;
  const totals = accountTotals(props.transactions);
  const diff = permissionDiff(permissions[selectedUserId] ?? [], editor.ids(selectedUserId));
  function navigate(action: () => void) {
    if (transactionBusy) { setNotice('Finish the recording or current operation first.'); return; }
    if (transactionDirty || ledgerDirty) setPendingNavigation(() => action);
    else action();
  }
  function statement(userScope: string, headId = filters.headId, company = false) {
    navigate(() => { setFilters((f) => ({ ...f, userScope, headId })); setPage(company ? 'company' : 'statement'); setPreview(false); });
  }
  async function refresh() {
    setRefreshing(true); setNotice('');
    try {
      await props.onRefresh(); editor.reset(); setRevision((n) => n + 1);
      setHeadDirty(false); setUserDirty(false); setTransactionDirty(false); setLedgerDirty(false); setConfirmRefresh(false);
    } catch (error) { setNotice((error as Error).message); }
    finally { setRefreshing(false); }
  }
  return <main className="admin-page">
    <header className="admin-header">
      <button className="brand-home" onClick={() => navigate(() => { setPage('home'); setPreview(false); })}><img src={logo} alt="" /><span>Sohail Malik Architects<small>Cashbook</small></span></button>
      <div className="flex-row flex-wrap gap-sm">
        {page !== 'home' && <button className="btn" onClick={() => navigate(() => { setPage('home'); setPreview(false); })}>← Home</button>}
        <button className="btn" disabled={refreshing || transactionBusy} onClick={() => dirty ? setConfirmRefresh(true) : void refresh()}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
        <button className="btn" onClick={() => navigate(props.onLogout)}>Logout</button>
      </div>
    </header>
    {notice && <p role="status">{notice}</p>}
    <section className="admin-home" hidden={page !== 'home'}>
      <h1>Overview</h1>
      <dl className="home-totals">{Object.entries({ Credits: totals.totalBillPayment, Debits: totals.totalReceived, Balance: totals.remainingPayable }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl>
      <nav className="home-cards" aria-label="Cashbook sections">{cards.map((card) => <button key={card.id} className={`home-card home-card--${card.tone}`} onClick={() => navigate(() => { setPreview(false); setPage(card.id); })}>
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={card.icon} /></svg><span>{card.title}</span>
      </button>)}</nav>
    </section>
    <div className={`admin-content${preview ? ' admin-content--preview' : ''}`}>
      <section className="admin-controls flex-col gap-md" hidden={page !== 'users' && page !== 'heads'}>
        <h1>{page === 'heads' ? 'Heads Management' : 'Users'}</h1>
        {page === 'heads' && <UserPicker users={selectableUsers} value={selectedUserId} onChange={(id) => navigate(() => setSelectedUserId(id))} />}
        {selectedUser && <p className="text-muted">{selectedUser.user_name}</p>}
        {selectedUser && <div className="flex-row gap-sm">
          <button className="btn" aria-pressed={preview} onClick={() => navigate(() => setPreview(!preview))}>User preview</button>
          <button className="btn" aria-pressed={showPermissions && page === 'heads'} onClick={() => { setShowPermissions(!(showPermissions && page === 'heads')); setPage('heads'); }}>Show permissions</button>
        </div>}
        <div hidden={page !== 'heads'}>
          {selectedUser && <PermissionChanges key={`${selectedUserId}:${revision}`} user={selectedUser} heads={heads} editor={editor} onSave={props.onSavePermissions} />}
          <div><HeadsTab key={revision} heads={heads} permissionIds={showPermissions && selectedUser ? editor.ids(selectedUserId) : undefined} reservedIds={Object.values(permissions).flat().map(Math.abs)} onSubmitChanges={props.onSubmitHeadChanges} onDirtyChange={setHeadDirty}
            onHeadAction={(head, action) => {
              if (head.head_id < 0) { setNotice('Apply this new head first.'); return; }
              setActionUser(selectedUserId); setHeadAction({ head, action }); setNotice('');
            }} /></div>
        </div>
        <div hidden={page !== 'users'}><UsersTab key={revision} currentAdminUserId={currentAdminUserId} users={users} selectedUserId={selectedUserId}
          onSelect={(id) => navigate(() => setSelectedUserId(id))} onViewLedger={(id) => statement(id)} onCreateUser={props.onCreateUser} onSaveProfile={props.onSaveProfile}
          onChangePassword={props.onChangePassword} onDirtyChange={setUserDirty} onAction={async (id, action) => {
            if (id === selectedUserId && transactionDirty) throw new Error('Finish or cancel this transaction draft first.');
            await props.onUserAction?.(id, action);
          }} /></div>
      </section>
      {preview && selectedUser ? <section className="admin-preview"><UserPreview key={`${selectedUserId}:${revision}`} user={selectedUser} onRefresh={props.onRefresh} heads={heads} assigned={editor.ids(selectedUserId)} pending={diff.granted.length + diff.revoked.length > 0}
        onDirtyChange={setTransactionDirty} onBusyChange={setTransactionBusy} onClose={() => navigate(() => setPreview(false))} /></section>
        : (page === 'company' || page === 'statement') && <Ledger key={`${revision}:${page}`} company={page === 'company'} filters={filters} onFilterChange={setFilters} revision={revision} heads={heads} users={users} onDirtyChange={setLedgerDirty}
          onChanged={props.onRefresh} />}
    </div>
    {headAction && <Dialog title={`${headAction.action === 'give' ? 'Give permission' : 'Revoke permission'} · ${headAction.head.head_name}`} onClose={() => setHeadAction(null)}>
      <UserPicker users={selectableUsers} value={actionUser} onChange={setActionUser} />
      <p className="hint">Includes subheads. Changes are saved when you apply permissions.</p>
      <div className="flex-row justify-end gap-sm">
        <button className="btn" onClick={() => setHeadAction(null)}>Back</button>
        <button className="btn btn--primary" disabled={!actionUser} onClick={() => {
          editor.stageBranch(actionUser, headAction.head.head_id, headAction.action === 'give');
          setSelectedUserId(actionUser); setHeadAction(null);
        }}>Stage permission change</button>
      </div>
    </Dialog>}
    {confirmRefresh && <Dialog title="Discard drafts and refresh?" onClose={() => setConfirmRefresh(false)} busy={refreshing}>
      <p>Refresh will discard unapplied edits and reload saved data.</p>
      <div className="flex-row justify-end gap-sm"><button className="btn" disabled={refreshing} onClick={() => setConfirmRefresh(false)}>Keep editing</button><button className="btn btn--primary" disabled={refreshing} onClick={refresh}>Refresh</button></div>
    </Dialog>}
    {pendingNavigation && <Dialog title="Discard the open transaction draft?" onClose={() => setPendingNavigation(null)}>
      <div className="flex-row justify-end gap-sm"><button className="btn" onClick={() => setPendingNavigation(null)}>Keep editing</button><button className="btn btn--primary" onClick={() => { pendingNavigation(); setPendingNavigation(null); setTransactionDirty(false); setLedgerDirty(false); }}>Discard and continue</button></div>
    </Dialog>}
  </main>;
}
