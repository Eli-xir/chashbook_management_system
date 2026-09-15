import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Head } from './types'

export type IconName = 'book' | 'folder' | 'arrow' | 'back' | 'plus' | 'check' | 'image' | 'camera' | 'mic' | 'users' | 'settings' | 'logout' | 'close' | 'shield' | 'clock' | 'search' | 'edit' | 'upload'
const paths: Record<IconName, ReactNode> = {
  book: <><path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zM13 7a3 3 0 0 1 3-3h4v15h-3a4 4 0 0 0-4 2" /></>,
  folder: <path d="M3 7V5h7l2 3h9v11H3z" />,
  arrow: <path d="m9 5 7 7-7 7" />,
  back: <path d="m14 5-7 7 7 7M7 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 4 4L19 6" />,
  image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-7 5 8"/></>,
  camera: <><path d="M8 6 10 3h4l2 3h5v14H3V6z"/><circle cx="12" cy="13" r="4"/></>,
  mic: <><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></>,
  users: <><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2"/></>,
  settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/></>,
  logout: <><path d="M9 3H3v18h6M8 12h13m-5-5 5 5-5 5"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 11 3 3 5-5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
  edit: <><path d="m14 4 6 6M4 20l2-7L17 2l5 5-11 11z"/></>,
  upload: <path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" />,
}
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
export function Brand() { return <span className="brand"><span className="brand-mark"><Icon name="book" size={23}/></span>cashbook<span className="brand-dot">.</span></span> }
export function Alert({ children, success = false }: { children: ReactNode; success?: boolean }) { return children ? <div className={success ? 'ok-banner' : 'error-banner'} role={success ? 'status' : 'alert'}>{children}</div> : null }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><span className="empty-icon"><Icon name="folder" size={28}/></span><h3>{title}</h3><p>{children}</p></div> }
export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) { return <header className="page-title"><div><span className="eyebrow">YOUR WORKSPACE</span><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</header> }
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal(); const old = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = old; ref.current?.close() } }, [])
  return <dialog ref={ref} className="modal" onCancel={e => { e.preventDefault(); onClose() }} aria-label={title}><div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close"/></button></div>{children}</dialog>
}
export const money = (value: number) => new Intl.NumberFormat('en-PK').format(value)
export const dateTime = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' })
export const typeLabel = (name: string) => ({ debit_user: 'Debit user', credit_user: 'Credit user', admin: 'Administrator', debit: 'Debit', credit: 'Credit', payable_debit: 'Payable debit', payable_credit: 'Payable credit' }[name] ?? name)
export function flatten(heads: Head[], prefix = ''): (Head & { path: string })[] { return heads.flatMap(h => { const path = prefix ? `${prefix} / ${h.head_name}` : h.head_name; return [{ ...h, path }, ...flatten(h.children, path)] }) }
