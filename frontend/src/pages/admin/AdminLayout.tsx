import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth'

export default function AdminLayout() {
  const { me, signOut } = useAuth()
  const navigate = useNavigate()

  async function doSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="admin-shell">
      <nav className="admin-sidebar">
        <div className="brand">Cashbook</div>
        <NavLink to="/" end>Cashbook</NavLink>
        <NavLink to="/heads">Heads</NavLink>
        <NavLink to="/users">Users</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <div style={{ flex: 1 }} />
        <button className="subtle" style={{ color: '#cbd5e1' }} onClick={doSignOut}>
          Sign out ({me?.username})
        </button>
      </nav>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
