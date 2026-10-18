import { useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../../../Icon';
import { HomeCard } from './HomeCard';
import { matchesUser } from '../utils/userProfile';
import { balanceTotal, type BalanceCategory, type OutstandingUser } from '../utils/outstandingBalances';
import { money } from '../../Ledger/ledgerModel';

export function OutstandingPage({ category, entries, onBack, onStatement, onPay, children }: {
  children?: ReactNode; onPay?: (id: string) => void;
  category: BalanceCategory; entries: OutstandingUser[]; onBack: () => void; onStatement: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('highest');
  const accounts = entries.filter((entry) => entry.category === category);
  const visible = accounts.filter(({ user }) => matchesUser(user, search)
    && (status === 'all' || user.is_active === (status === 'active')))
    .sort((a, b) => (sort === 'name' ? 0 : sort === 'lowest' ? a.amount - b.amount : b.amount - a.amount)
      || a.user.user_name.localeCompare(b.user.user_name) || a.user.user_id.localeCompare(b.user.user_id));
  const title = category === 'receivable' ? 'Receivable' : 'Payable';
  return <section className="flex-col gap-md">
    <header className="flex-row flex-wrap items-center gap-sm">
      <button className="btn" onClick={onBack}>← Back to Home</button><h1>{title}</h1>
    </header>
    {children}
    {children && <h2>Normal user balances</h2>}
    <p className="text-muted">{category === 'receivable' ? 'Money given to users exceeding their submitted bills.' : 'Submitted bills exceeding the money given to users.'} Current balances across all dates.</p>
    <div className="flex-row flex-wrap items-center gap-sm" role="group" aria-label={`${title} filters`}>
      <label className="field"><span>Search users</span><input type="search" placeholder="Name, contact or description" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All users</option><option value="active">Active users</option><option value="inactive">Inactive users</option></select></label>
      <label className="field"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="highest">Highest amount first</option><option value="lowest">Lowest amount first</option><option value="name">Name A–Z</option></select></label>
      <button className="btn" disabled={!search && status === 'all' && sort === 'highest'} onClick={() => { setSearch(''); setStatus('all'); setSort('highest'); }}>Clear filters</button>
    </div>
    <dl className="ledger-totals">
      <div><dt>Total {title.toLowerCase()}</dt><dd>{money(balanceTotal(accounts))}</dd></div>
      <div><dt>Matching users</dt><dd>{visible.length} / {accounts.length}</dd></div>
      <div><dt>Matching amount</dt><dd>{money(balanceTotal(visible))}</dd></div>
    </dl>
    <div className="home-cards">{visible.map(({ user, amount }) => <HomeCard key={user.user_id}
      title={user.user_name} description={user.description} detail={user.is_active ? 'Active user' : 'Inactive user'} amount={money(amount)}
      tone={category === 'receivable' ? 'green' : 'gold'} accountType="user"
      icon={<Icon size={42}><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></Icon>}
      onClick={() => onStatement(user.user_id)} actions={<div className="flex-row flex-wrap gap-sm"><button className="btn" onClick={() => onStatement(user.user_id)}>View statement</button>
        {category === 'payable' && onPay && <button className="btn" disabled={!user.is_active} title={user.is_active ? 'Record a payment to this user' : 'Reactivate this user before paying'} onClick={() => onPay(user.user_id)}>Pay user</button>}</div>} />)}</div>
    {!visible.length && <p role="status" className="text-muted">{accounts.length ? 'No users match these filters.' : `No ${title.toLowerCase()} balances. Users with PKR 0 balance are excluded.`}</p>}
  </section>;
}
