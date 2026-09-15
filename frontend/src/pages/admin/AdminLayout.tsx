import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../../auth'
import { Alert, Brand, Icon } from '../../ui'
import type { IconName } from '../../ui'
const links: {to:string; label:string; icon:IconName}[] = [{to:'/',label:'Cashbook',icon:'book'},{to:'/heads',label:'Heads',icon:'folder'},{to:'/users',label:'People',icon:'users'},{to:'/settings',label:'Settings',icon:'settings'}]
export default function AdminLayout() {
 const {me,signOut}=useAuth(), location=useLocation(); const [error,setError]=useState('')
 return <div className="admin-shell"><aside className="admin-sidebar"><Brand/><span className="nav-label">WORKSPACE</span><nav>{links.map(l=><NavLink key={l.to} to={l.to} end={l.to==='/'}><Icon name={l.icon}/><span>{l.label}</span></NavLink>)}</nav><div className="sidebar-note"><Icon name="shield"/><strong>All in one place.</strong><p>Every head, person, and entry. Managed by you.</p></div><div className="sidebar-account"><span className="avatar">{me?.username.slice(0,1).toUpperCase()}</span><div><strong>{me?.username}</strong><small>Administrator</small></div><button className="icon-button" aria-label="Sign out" onClick={()=>signOut().catch(e=>setError(e.message))}><Icon name="logout" size={18}/></button></div></aside><div className="admin-workspace"><header className="admin-topbar"><span>Workspace <span className="slash">/</span> <strong>{links.find(l=>l.to==='/'?location.pathname==='/':location.pathname.startsWith(l.to))?.label || 'Transaction'}</strong></span><span className="tag"><span className="status-dot"/> PKR · Karachi</span></header><main className="admin-main"><Alert>{error}</Alert><Outlet/></main></div></div>
}
