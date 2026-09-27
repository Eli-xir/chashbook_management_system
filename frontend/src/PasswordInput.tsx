import { Icon } from './Icon';
import { useState, type InputHTMLAttributes } from 'react';

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);
  const label = visible ? 'Hide password' : 'Show password';
  return <span className="password-input">
    <input {...props} type={visible ? 'text' : 'password'} />
    <button type="button" className="password-toggle" disabled={props.disabled}
      aria-label={label} title={label} aria-pressed={visible}
      onClick={() => setVisible((current) => !current)}>
      <Icon size={20} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        {visible && <path d="m3 3 18 18" />}
      </Icon>
    </button>
  </span>;
}
