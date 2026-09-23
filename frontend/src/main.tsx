import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import App from './App.tsx'
import './styles/utilities.css'
import './pages/Admin/components/ConfirmChangesDialog.css'
import './pages/Admin/components/Sidebar.css'
import './pages/Admin/components/UsersTab.css'
import './pages/Admin/components/HeadsTab.css'
import './pages/Admin/AdminPage.css'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
