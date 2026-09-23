import { Routes, Route, Link } from 'react-router-dom'
import { Login } from './Login.tsx'
import { AdminPage } from './pages/Admin/AdminPage.tsx'
import './App.css'

// TEMP: replace with real auth/session + API data once those exist.
const mockCurrentAdminUserId = 'admin-1';
const mockUsers = [
  { user_id: 'admin-1', user_name: 'Sohail Malik', contact_no: '0300-0000000', is_active: true },
];
const mockHeads: import('./pages/Admin/types').Head[] = [];

function App() {
  return (
    <Routes>
      <Route path="/" element={<><h1>Welcome to the App</h1><Link to="/login">Go to Login</Link></>} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/Admin"
        element={
          <AdminPage
            currentAdminUserId={mockCurrentAdminUserId}
            users={mockUsers}
            heads={mockHeads}
            onLogout={() => console.log('logout')}
          />
        }
      />
      <Route path="/User" element={<h1>User Page</h1>} />
    </Routes>
  )
}

export default App