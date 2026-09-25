import { useState } from 'react';
import type { CashbookData, AdminUser, CreateUserInput, FiltersState, Head, StagedChange, UserAction, UserProfile } from './types';
import { HeadsTab } from './components/HeadsTab';
import { UsersTab } from './components/UsersTab';
import { PermissionChanges } from './components/PermissionChanges';
import { UserPreview } from './components/UserPreview';
import { UserPicker } from './components/UserPicker';
import { Dialog } from './components/Dialog';
import { AdminTransactionDialog } from './components/AdminTransactionDialog';
import { AdminCreditFlow } from './components/AdminCreditFlow';
import { CreditUserCards } from './components/CreditUserCards';
import { HomeCard } from './components/HomeCard';
import { usePermissionChanges } from './hooks/usePermissionChanges';
import { permissionDiff, permittedHeads } from './utils/permissions';
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
type HeadMode = 'manage' | 'preview' | 'permissions';
type Page = 'home' | 'credit' | typeof cards[number]['id'];
export function AdminPage(props: AdminPageProps) {
  const { users, heads, permissions, currentAdminUserId } = props;
  const [page, setPage] = useState<Page>('home');
  const [filters, setFilters] = useState<FiltersState>({ dateFrom: '', dateTo: '', userScope: 'all', direction: 'both' });
  const [selectedUserId, setSelectedUserId] = useState('');
  const [headMode, setHeadMode] = useState<HeadMode>('manage');
  const [headsFromUsers, setHeadsFromUsers] = useState(false);
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
  const [homeTransaction, setHomeTransaction] = useState<'debit' | null>(null);
  const [creditShortcut, setCreditShortcut] = useState<{ id: string; mode: 'transaction' | 'edit' } | null>(null);
  const [headPermission, setHeadPermission] = useState<{ head: Head; allow: boolean } | null>(null);
  const [permissionUsers, setPermissionUsers] = useState<string[]>([]);
  const editor = usePermissionChanges(permissions, heads);
  const selectableUsers = users.filter((u) => u.user_id !== currentAdminUserId && u.role !== 'admin');
  const selectedUser = selectableUsers.find((u) => u.user_id === selectedUserId);
  const permissionCandidates = headPermission ? selectableUsers.filter((user) => {
    const hasAccess = permittedHeads(heads, editor.ids(user.user_id)).some((head) => head.head_id === headPermission.head.head_id);
    return hasAccess !== headPermission.allow;
  }) : [];
  const preview = page === 'heads' && headMode === 'preview' && !!selectedUser;
  const dirty = headDirty || userDirty || editor.dirty || transactionDirty || ledgerDirty;
  const totals = accountTotals(props.transactions);
  const diff = permissionDiff(permissions[selectedUserId] ?? [], editor.ids(selectedUserId));
  function navigate(action: () => void) {
    if (transactionBusy) { setNotice('Finish the recording or current operation first.'); return; }
    if (transactionDirty || ledgerDirty) setPendingNavigation(() => action);
    else action();
  }
  function closeHeadView() {
    navigate(() => { setHeadMode('manage'); if (headsFromUsers) setPage('users'); });
  }
  function statement(userScope: string, headId = filters.headId, company = false) {
    navigate(() => { setFilters((f) => ({ ...f, userScope, headId })); setPage(company ? 'company' : 'statement'); setHeadMode('manage'); });
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
      <button className="brand-home" onClick={() => navigate(() => { setPage('home'); setHeadMode('manage'); })}><img src={logo} alt="" /><span>Sohail Malik Architects<small>Cashbook</small></span></button>
      <div className="flex-row flex-wrap gap-sm">
        {page !== 'home' && page !== 'credit' && <button className="btn" onClick={() => navigate(() => { setPage('home'); setHeadMode('manage'); })}>← Home</button>}
        <button className="btn" disabled={refreshing || transactionBusy} onClick={() => dirty ? setConfirmRefresh(true) : void refresh()}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
        <button className="btn" onClick={() => navigate(props.onLogout)}>Logout</button>
      </div>
    </header>
    {notice && <p role="status">{notice}</p>}
    <section className="admin-home" hidden={page !== 'home'}>
      <h1>Overview</h1>
      <dl className="home-totals">{Object.entries({ Credits: totals.totalBillPayment, Debits: totals.totalReceived, Balance: totals.remainingPayable }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl>
      <nav className="home-cards" aria-label="Cashbook sections">{cards.map((card) => <HomeCard key={card.id} title={card.title} tone={card.tone} onClick={() => navigate(() => {
        setHeadMode('manage'); setHeadsFromUsers(false);
        if (card.id === 'statement') setFilters((current) => current.userScope.startsWith('credit:') ? { ...current, userScope: 'all' } : current);
        setPage(card.id);
      })} icon={<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={card.icon} /></svg>} />)}</nav>
      <nav className="home-cards" aria-label="New transactions">
        {([['credit', 'Admin credit', 'green'], ['debit', 'User debit', 'gold']] as const).map(([action, label, tone]) =>
          <HomeCard key={action} title={label} tone={tone} onClick={() => action === 'credit'
            ? navigate(() => { setCreditShortcut(null); setPage('credit'); }) : setHomeTransaction('debit')} icon={
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={action === 'credit' ? 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5' : 'M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5'} />
            </svg>} />)}
      </nav>
      {props.creditUsers.some((user) => user.is_active && user.is_pinned) && <section className="pinned-credit-users flex-col gap-md">
        <h2>Pinned external users</h2>
        <CreditUserCards users={props.creditUsers.filter((user) => user.is_active && user.is_pinned)} onChanged={props.onRefresh}
          onOpen={(user) => navigate(() => { setCreditShortcut({ id: user.credit_user_id, mode: 'transaction' }); setPage('credit'); })}
          onEdit={(user) => navigate(() => { setCreditShortcut({ id: user.credit_user_id, mode: 'edit' }); setPage('credit'); })} />
      </section>}
    </section>
    <div className="admin-content">
      <section className="admin-controls flex-col gap-md" hidden={page !== 'users' && page !== 'heads'}>
        <h1>{page === 'heads' ? headsFromUsers ? selectedUser?.user_name : 'Heads Management' : 'Users'}</h1>
        {page === 'heads' && !headsFromUsers && <UserPicker users={selectableUsers} value={selectedUserId} onChange={(id) => navigate(() => { setSelectedUserId(id); if (!id) setHeadMode('manage'); })} />}
        {page === 'heads' && <div className="head-mode-switch" role="group" aria-label="Head view">
          {headsFromUsers && <button className="btn" onClick={closeHeadView}>← Back to users</button>}
          {([['manage', 'Manage Heads'], ['preview', 'User Preview'], ['permissions', 'Show Permissions']] as const).filter(([mode]) => !headsFromUsers || mode !== 'manage').map(([mode, label]) =>
            <button key={mode} className="btn" aria-pressed={page === 'heads' && headMode === mode}
              disabled={mode !== 'manage' && !selectedUser}
              onClick={() => headMode === mode ? closeHeadView() : navigate(() => setHeadMode(mode))}>{label}</button>)}
        </div>}
        <div hidden={page !== 'heads' || preview}>
          <div><HeadsTab key={revision} heads={heads} readOnly={headMode === 'permissions'} onPermissionChange={(head, allow) => {
              if (head.head_id < 0) { setNotice('Apply this new head first.'); return; }
              if (selectedUser) { editor.stageBranch(selectedUserId, head.head_id, allow); setNotice(''); }
            }} permissionIds={headMode === 'permissions' && selectedUser ? editor.ids(selectedUserId) : undefined} reservedIds={Object.values(permissions).flat().map(Math.abs)} onSubmitChanges={props.onSubmitHeadChanges} onDirtyChange={setHeadDirty}
            onHeadAction={(head, action) => {
              if (head.head_id < 0) { setNotice('Apply this new head first.'); return; }
              setHeadPermission({ head, allow: action === 'give' });
              setPermissionUsers([]); setNotice('');
            }} /></div>
          {selectedUser && headMode === 'permissions' && <PermissionChanges key={`${selectedUserId}:${revision}`} user={selectedUser} heads={heads} editor={editor} onSave={props.onSavePermissions} />}
          {headMode === 'manage' && selectableUsers.filter((user) => editor.get(user.user_id).history.length > 1).map((user) =>
            <PermissionChanges key={`${user.user_id}:${revision}`} user={user} heads={heads} editor={editor} onSave={props.onSavePermissions} />)}
        </div>
        <div hidden={page !== 'users'}><UsersTab key={revision} currentAdminUserId={currentAdminUserId} users={users} selectedUserId={selectedUserId}
          onSelect={(id) => navigate(() => { setSelectedUserId(id); if (!id) setHeadMode('manage'); })} onViewLedger={(id) => statement(id)} onCreateUser={props.onCreateUser} onSaveProfile={props.onSaveProfile}
          onOpenHeadView={(id, mode) => navigate(() => { setSelectedUserId(id); setHeadsFromUsers(true); setHeadMode(mode); setPage('heads'); })}
          onChangePassword={props.onChangePassword} onDirtyChange={setUserDirty} onAction={async (id, action) => {
            if (id === selectedUserId && transactionDirty) throw new Error('Finish or cancel this transaction draft first.');
            await props.onUserAction?.(id, action);
          }} /></div>
      </section>
      {preview && selectedUser ? <section className="admin-preview"><UserPreview key={`${selectedUserId}:${revision}`} user={selectedUser} onRefresh={props.onRefresh} heads={heads} assigned={editor.ids(selectedUserId)} pending={diff.granted.length + diff.revoked.length > 0}
        onDirtyChange={setTransactionDirty} onBusyChange={setTransactionBusy} onClose={closeHeadView} /></section>
        : (page === 'company' || page === 'statement') && <Ledger key={`${revision}:${page}`} company={page === 'company'} filters={filters} onFilterChange={setFilters} revision={revision} heads={heads} users={users} onDirtyChange={setLedgerDirty}
          onChanged={props.onRefresh} />}
      {page === 'credit' && users.find((user) => user.user_id === currentAdminUserId) &&
        <AdminCreditFlow key={creditShortcut ? `${creditShortcut.mode}:${creditShortcut.id}` : 'menu'} admin={users.find((user) => user.user_id === currentAdminUserId)!}
          initialCreditUserId={creditShortcut?.mode === 'transaction' ? creditShortcut.id : ''}
          initialEditCreditUserId={creditShortcut?.mode === 'edit' ? creditShortcut.id : ''} creditUsers={props.creditUsers} heads={heads}
          onClose={() => setPage('home')} onRefresh={props.onRefresh} onDirtyChange={setTransactionDirty} onBusyChange={setTransactionBusy} />}
    </div>
    {homeTransaction === 'debit' && <AdminTransactionDialog title="User debit" users={users} heads={heads}
      onClose={() => setHomeTransaction(null)} onSubmitted={props.onRefresh} />}
    {headPermission && <Dialog title={`${headPermission.allow ? 'Give permission' : 'Revoke permission'} · ${headPermission.head.head_name}`} onClose={() => setHeadPermission(null)}>
      <p>Select users. This change includes all subheads.</p>
      <UserPicker users={permissionCandidates} selectedIds={permissionUsers} onChange={(id) => setPermissionUsers((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id])} />
      {!permissionCandidates.length && <p className="text-muted">{headPermission.allow ? 'All users already have access to this head.' : 'No users have access to this head.'}</p>}
      <div className="flex-row justify-end gap-sm">
        <button className="btn" onClick={() => setHeadPermission(null)}>Cancel</button>
        <button className="btn btn--primary" disabled={!permissionUsers.length} onClick={() => {
          permissionCandidates.filter((user) => permissionUsers.includes(user.user_id)).forEach((user) => editor.stageBranch(user.user_id, headPermission.head.head_id, headPermission.allow));
          setHeadPermission(null); setPermissionUsers([]);
        }}>Stage changes{permissionUsers.length ? ` (${permissionUsers.length})` : ''}</button>
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
