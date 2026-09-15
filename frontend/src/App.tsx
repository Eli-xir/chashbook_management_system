import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Login from './pages/Login'
import Recover from './pages/Recover'
import UserFlow from './pages/UserFlow'
import AdminLayout from './pages/admin/AdminLayout'
import Cashbook from './pages/admin/Cashbook'
import TransactionDetail from './pages/admin/TransactionDetail'
import Heads from './pages/admin/Heads'
import Users from './pages/admin/Users'
import UserDetail from './pages/admin/UserDetail'
import Settings from './pages/admin/Settings'

function Loading() {
  return <div className="spin" aria-label="Loading" />
}

export default function App() {
  const { me, loading } = useAuth()

  if (loading) return <Loading />

  return (
    <Routes>
      <Route path="/login" element={me ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/recover" element={me ? <Navigate to="/" replace /> : <Recover />} />
      <Route
        path="/*"
        element={
          !me ? (
            <Navigate to="/login" replace />
          ) : me.role === 'admin' ? (
            <Routes>
              <Route element={<AdminLayout />}>
                <Route index element={<Cashbook />} />
                <Route path="transactions/:id" element={<TransactionDetail />} />
                <Route path="heads" element={<Heads />} />
                <Route path="users" element={<Users />} />
                <Route path="users/:id" element={<UserDetail />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          ) : (
            <UserFlow />
          )
        }
      />
    </Routes>
  )
}
