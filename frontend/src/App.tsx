import { useState } from 'react';
import { Navigate, Routes, Route, useNavigate } from 'react-router-dom';
import { Login } from './Login';
import { AdminPage } from './pages/Admin/AdminPage';
import { readAdminData } from './data/adminStore';
import { ADMIN_ID, cashbookApi } from './data/cashbookApi';
import { UserPreview } from './pages/Admin/components/UserPreview';
import { permittedHeads } from './pages/Admin/utils/permissions';

export default function App() {
  const navigate = useNavigate();
  const [data, setData] = useState(readAdminData);
  const [session, setSession] = useState(cashbookApi.currentSession);
  const user = data.users.find((item) => item.user_id === session?.userId && item.is_active);
  const home = !user ? '/login' : session?.role === 'admin' ? '/Admin' : '/User';
  async function logout() {
    await cashbookApi.signOut(); setSession(null); navigate('/login', { replace: true });
  }
  return (
    <Routes>
      <Route path="/login" element={<Login onSignedIn={async (next) => {
        setData(await cashbookApi.refresh()); setSession(next);
      }} />} />
      <Route path="/Admin" element={
        user && session?.role === 'admin' ? <AdminPage currentAdminUserId={ADMIN_ID} {...data}
          retiredHeadIds={data.headDeletionRequests?.map((change) => change.head_id)}
          onSubmitHeadChanges={async (changes) => {
            const saved = await cashbookApi.saveHeads(changes); setData(saved); return saved.heads;
          }}
          onSavePermissions={async (userId, ids) => {
            const saved = await cashbookApi.savePermissions(userId, ids); setData(saved); return saved.permissions[userId];
          }}
          onSaveProfile={async (userId, profile) => { setData(await cashbookApi.saveProfile(userId, profile)); }}
          onCreateUser={async (input) => {
            const saved = await cashbookApi.createUser(input); setData(saved.data); return saved.user;
          }}
          onChangePassword={async (userId, password) => { await cashbookApi.changePassword(userId, password); }}
          onUserAction={async (userId, action) => { setData(await cashbookApi.userAction(userId, action)); }}
          onRefresh={async () => { setData(await cashbookApi.refresh()); }}
          onLogout={() => { void logout(); }} /> : <Navigate to={home} replace />
      } />
      <Route path="/User" element={user && session?.role === 'user' ?
        <main className="user-page"><UserPreview key={user.user_id} user={user} preview={false}
          heads={permittedHeads(data.heads, data.permissions[user.user_id] ?? [])}
          assigned={data.permissions[user.user_id] ?? []} pending={false} onClose={() => { void logout(); }} />
        </main> : <Navigate to={home} replace />} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}
