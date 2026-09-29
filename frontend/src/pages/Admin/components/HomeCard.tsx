import { Icon } from '../../../Icon';
import type { ReactNode } from 'react';

export function HomeCard({ title, icon, tone, onClick, description, detail, actions, accountType, onAttachments, onStatement, selected = false, disabled = false }: {
  title: string; icon: ReactNode; tone: 'blue' | 'gold' | 'green' | 'purple'; onClick: () => void;
  description?: string; detail?: string; actions?: ReactNode; selected?: boolean; disabled?: boolean;
  onAttachments?: () => void; onStatement?: () => void;
  accountType?: 'user' | 'external' | 'admin';
}) {
  const content = <>
    {icon}
    <span className="home-card-title">{title}</span>
    {description && <small className="home-card-description" title={description}>{description}</small>}
    {detail && <small className="home-card-detail">{detail}</small>}
  </>;
  const className = `home-card home-card--${tone}`;
  return actions || onAttachments || onStatement ? <article className={`${className} credit-user-card${selected ? ' credit-user-card--selected' : ''}`}>
    {accountType && <span className="account-type-badge" title={accountType === 'external' ? 'External user' : accountType === 'admin' ? 'Administrator' : 'User'}
      role="img" aria-label={accountType === 'external' ? 'External user' : accountType === 'admin' ? 'Administrator' : 'User'}>
      <Icon size={18} strokeWidth="1.7">
        {accountType === 'external' ? <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>
          : accountType === 'admin' ? <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
          : <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>}
      </Icon>
    </span>}
    {onStatement && <button className={`btn home-card-attachments${onAttachments ? ' home-card-statement' : ''}`} title="View statement" aria-label={`View statement for ${title}`} disabled={disabled} onClick={onStatement}>
      <Icon size={18} strokeWidth="1.7"><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h2" /></Icon>
    </button>}
    {onAttachments && <button className="btn home-card-attachments" title="View attachments" aria-label={`View attachments for ${title}`} disabled={disabled} onClick={onAttachments}>
      <Icon size={18} strokeWidth="1.7"><path d="M21 11.5 12.5 20a6 6 0 0 1-8.5-8.5L13 2.5a4 4 0 0 1 5.5 5.5l-9 9a2 2 0 0 1-3-3L15 5" /></Icon>
    </button>}
    <button className="home-card-main" onClick={onClick} disabled={disabled}>{content}</button>
    {actions}
  </article> : <button className={className} onClick={onClick} disabled={disabled}>{content}</button>;
}
