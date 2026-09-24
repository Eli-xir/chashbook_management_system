import { useRef, useState } from 'react';
import type { AdminData, AdminUser, CreateUserInput, FiltersState, Head, SidebarTab, StagedChange, UserAction, UserProfile } from './types';
import { Sidebar } from './components/Sidebar';
import { FiltersTab } from './components/FiltersTab';
import { HeadsTab } from './components/HeadsTab';
import { UsersTab } from './components/UsersTab';
import { PermissionsEditor } from './components/PermissionsEditor';
import { UserPreview } from './components/UserPreview';
import { Dialog } from './components/Dialog';
import { usePermissionChanges } from './hooks/usePermissionChanges';
import { permissionDiff } from './utils/permissions';
import { Ledger } from '../Ledger/Ledger';
import './AdminPage.css';

interface AdminPageProps extends AdminData {
  currentAdminUserId: string;
  onLogout: () => void;
  onRefresh: () => Promise<void>;
  onSubmitHeadChanges: (changes: StagedChange[]) => Promise<Head[]>;
  onSavePermissions: (userId: string, ids: number[]) => Promise<number[]>;
  onSaveProfile: (userId: string, profile: UserProfile) => Promise<void>;
  onCreateUser: (input: CreateUserInput) => Promise<AdminUser>;
  onChangePassword?: (userId: string, password: string) => Promise<void>;
  onCreateCategory: (name: string) => Promise<void>;
  onDeleteCategory: (id: number) => Promise<void>;
  onUserAction?: (userId: string, action: UserAction) => Promise<void>;
}

export function AdminPage(props: AdminPageProps) {
  const { currentAdminUserId, users, heads, permissions, onLogout, onSubmitHeadChanges } = props;
  const [activeTab, setActiveTab] = useState<SidebarTab>('filters');
  const [filters, setFilters] = useState<FiltersState>({ dateFrom: '', dateTo: '', userScope: 'all', direction: 'both' });
  const [selectedUserId, setSelectedUserId] = useState('');
  const [permissionMode, setPermissionMode] = useState(false);
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
  const [categoryName, setCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const permissionEditor = usePermissionChanges(permissions);
  const selectableUsers = users.filter((user) => user.user_id !== currentAdminUserId);
  const selectedUser = selectableUsers.find((user) => user.user_id === selectedUserId);
  const dirty = headDirty || userDirty || permissionEditor.dirty || transactionDirty || ledgerDirty;
  const ledger = useRef<HTMLElement>(null);

  function navigatePreview(action: () => void) {
    if (transactionBusy) { setNotice('Finish the recording or wait for the current operation first.'); return; }
    if (transactionDirty) setPendingNavigation(() => action);
    else action();
  }
  function selectUser(userId: string) {
    if (userId === currentAdminUserId || userId === selectedUserId) return;
    navigatePreview(() => setSelectedUserId(userId));
  }

  function showLedger() {
    ledger.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    ledger.current?.focus({ preventScroll: true });
  }
  function viewLedger(userId: string) {
    navigatePreview(() => {
      setFilters((previous) => ({ ...previous, userScope: userId }));
      setSelectedUserId(userId);
      setPreview(false);
      showLedger();
    });
  }
  async function userAction(userId: string, action: UserAction) {
    if (userId === selectedUserId && transactionDirty) throw new Error('Finish or cancel this user’s transaction draft first.');
    if (!props.onUserAction) throw new Error('Account actions are not connected yet. No changes were made.');
    await props.onUserAction(userId, action);
  }
  async function refresh() {
    setRefreshing(true);
    setNotice('');
    try {
      await props.onRefresh();
      permissionEditor.reset();
      setRevision((value) => value + 1);
      setHeadDirty(false);
      setUserDirty(false);
      setTransactionDirty(false);
      setConfirmRefresh(false);
      setNotice('Saved data refreshed.');
    } catch { setNotice('Refresh failed. Your edits have been kept; please try again.'); }
    finally { setRefreshing(false); }
  }
  const previewDiff = permissionDiff(permissions[selectedUserId] ?? [], permissionEditor.ids(selectedUserId));

  return (
    <main className="admin-page">
      <div className="admin-panel--sidebar">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onLogout={() => navigatePreview(onLogout)}
          refreshing={refreshing} onRefresh={() => {
            if (transactionBusy) { setNotice('Finish the recording or current operation before refreshing.'); return; }
            if (dirty) setConfirmRefresh(true); else void refresh();
          }}>
          <div className="user-context flex-col gap-sm">
            <label className="field">
              <span>Selected user</span>
              <select value={selectedUser?.user_id ?? ''} onChange={(event) => selectUser(event.target.value)}>
                <option value="">Choose a user…</option>
                {selectableUsers.map((user) => <option key={user.user_id} value={user.user_id}>
                  {user.user_name}{user.is_active ? '' : ' (deactivated)'}
                </option>)}
              </select>
            </label>
            {selectedUser && (
              <div className="flex-row flex-wrap gap-sm">
                <button className="btn" aria-pressed={preview} onClick={() => navigatePreview(() => {
                  setPreview(!preview); if (!preview) showLedger();
                })}>User preview</button>
                <button className="btn" aria-pressed={permissionMode && activeTab === 'heads'}
                  onClick={() => { setPermissionMode(!(permissionMode && activeTab === 'heads')); setActiveTab('heads'); }}>Give permissions</button>
              </div>
            )}
          </div>
          {notice && <p role="status" className="hint refresh-notice">{notice}</p>}
          <section id="panel-filters" aria-label="Filters" hidden={activeTab !== 'filters'}>
            <FiltersTab users={selectableUsers} filters={filters} onChange={setFilters} />
            <details className="disclosure"><summary>Categories</summary>
              {props.categories?.map((category) => <div key={category.id} className="flex-row items-center justify-between gap-sm">
                <span>{category.name}</span>
                <button className="btn" disabled={savingCategory} onClick={async () => {
                  setSavingCategory(true); setNotice('');
                  try { await props.onDeleteCategory(category.id); setNotice('Category removed. Existing transactions are preserved.'); }
                  catch (error) { setNotice((error as Error).message); }
                  finally { setSavingCategory(false); }
                }}>Remove</button>
              </div>)}
              <form className="flex-col gap-sm" onSubmit={async (event) => {
                event.preventDefault(); setSavingCategory(true); setNotice('');
                try { await props.onCreateCategory(categoryName); setCategoryName(''); setNotice('Category added.'); }
                catch (error) { setNotice((error as Error).message); }
                finally { setSavingCategory(false); }
              }}>
                <label className="field"><span>New category</span><input required maxLength={48} value={categoryName}
                  disabled={savingCategory} onChange={(event) => setCategoryName(event.target.value)} /></label>
                <button className="btn" disabled={savingCategory}>{savingCategory ? 'Saving…' : 'Add category'}</button>
              </form>
            </details>
          </section>
          <section id="panel-heads" aria-label="Heads" hidden={activeTab !== 'heads'}>
            {permissionMode && (
              <div className="flex-col gap-md">
                {selectedUser ? (
                  <PermissionsEditor key={selectedUserId + ':' + revision} user={selectedUser} heads={heads}
                    editor={permissionEditor} onSave={props.onSavePermissions} />
                ) : <p className="text-muted">Choose a user above to assign permissions.</p>}
              </div>
            )}
            <div hidden={permissionMode}>
              <HeadsTab key={revision} heads={heads} reservedIds={Object.values(permissions).flat()}
                filterHeadId={filters.headId} onFilterHead={(headId) => navigatePreview(() => {
                  setFilters((previous) => ({ ...previous, headId })); setPreview(false); showLedger();
                })}
                onSubmitChanges={onSubmitHeadChanges} onDirtyChange={setHeadDirty} />
            </div>
          </section>
          <section id="panel-users" aria-label="Users" hidden={activeTab !== 'users'}>
            <UsersTab key={revision} currentAdminUserId={currentAdminUserId} users={users}
              selectedUserId={selectedUserId} onSelect={selectUser} onViewLedger={viewLedger} onCreateUser={props.onCreateUser}
              onAction={userAction} onSaveProfile={props.onSaveProfile}
              onChangePassword={props.onChangePassword} onDirtyChange={setUserDirty} />
          </section>
          <button className="btn mobile-only ledger-link" onClick={showLedger}>Ledger →</button>
        </Sidebar>
      </div>
      <section ref={ledger} className="admin-panel--ledger flex-col gap-md" tabIndex={-1} aria-label="Ledger">
        <button className="btn mobile-only" onClick={() =>
          document.getElementById(`panel-${activeTab}`)?.scrollIntoView({ block: 'nearest', inline: 'start' })
        }>Controls</button>
        {preview && selectedUser ? (
          <UserPreview key={selectedUserId + ':' + revision} user={selectedUser} heads={heads} assigned={permissionEditor.ids(selectedUserId)}
            onDirtyChange={setTransactionDirty} onBusyChange={setTransactionBusy}
            pending={previewDiff.granted.length + previewDiff.revoked.length > 0} onClose={() => navigatePreview(() => setPreview(false))} />
        ) : <Ledger key={revision} filters={filters} revision={revision} heads={heads} users={users} onDirtyChange={setLedgerDirty} />}
      </section>
      {confirmRefresh && (
        <Dialog title="Refresh saved data?" onClose={() => setConfirmRefresh(false)} busy={refreshing}>
          <p>You have unapplied edits. Refresh will discard these drafts and reload saved data.</p>
          {notice && <p role="alert">{notice}</p>}
          <div className="flex-row justify-end gap-sm">
            <button className="btn" disabled={refreshing} onClick={() => setConfirmRefresh(false)}>Keep editing</button>
            <button className="btn btn--primary" disabled={refreshing} onClick={refresh}>
              {refreshing ? 'Refreshing…' : 'Discard drafts and refresh'}
            </button>
          </div>
        </Dialog>
      )}
      {pendingNavigation && <Dialog title="Discard this transaction draft?" onClose={() => setPendingNavigation(null)}>
        <p>The amount, selections and attachments have not been submitted.</p>
        <div className="flex-row justify-end gap-sm">
          <button className="btn" onClick={() => setPendingNavigation(null)}>Keep editing</button>
          <button className="btn btn--primary" onClick={() => {
            pendingNavigation(); setPendingNavigation(null); setTransactionDirty(false);
          }}>Discard and continue</button>
        </div>
      </Dialog>}
    </main>
  );
}
