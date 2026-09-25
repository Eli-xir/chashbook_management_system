import type { ReactNode } from 'react';

export function HomeCard({ title, icon, tone, onClick, description, detail, actions, selected = false, disabled = false }: {
  title: string; icon: ReactNode; tone: 'blue' | 'gold' | 'green' | 'purple'; onClick: () => void;
  description?: string; detail?: string; actions?: ReactNode; selected?: boolean; disabled?: boolean;
}) {
  const content = <>
    {icon}
    <span className="home-card-title">{title}</span>
    {description && <small className="home-card-description" title={description}>{description}</small>}
    {detail && <small className="home-card-detail">{detail}</small>}
  </>;
  const className = `home-card home-card--${tone}`;
  return actions ? <article className={`${className} credit-user-card${selected ? ' credit-user-card--selected' : ''}`}>
    <button className="home-card-main" onClick={onClick} disabled={disabled}>{content}</button>
    {actions}
  </article> : <button className={className} onClick={onClick} disabled={disabled}>{content}</button>;
}
