import { useState } from 'react';
import type { Contract, Transaction } from '../types';
import { contractBalance } from '../utils/contractBalances';
import { money, roundMoney } from '../../Ledger/ledgerModel';
import { HomeCard } from './HomeCard';
import { Icon } from '../../../Icon';

export function ContractList({ contracts, transactions, onOpen, onCreate }: {
  contracts: Contract[]; transactions: Transaction[]; onOpen: (id: string) => void; onCreate: () => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('outstanding');
  const [sort, setSort] = useState('highest');
  const entries = contracts.map((contract) => ({ contract, ...contractBalance(contract, transactions) }));
  const visible = entries.filter(({ contract, remaining }) => `${contract.name} ${contract.description}`.toLowerCase().includes(search.toLowerCase())
    && (status === 'all' || status === 'outstanding' && remaining > 0 || status === 'settled' && remaining <= 0 || status === 'archived' && !contract.isActive))
    .sort((a, b) => (sort === 'name' ? 0 : sort === 'lowest' ? a.remaining - b.remaining : b.remaining - a.remaining) || a.contract.name.localeCompare(b.contract.name));
  return <section className="flex-col gap-md">
    <div className="flex-row flex-wrap items-center gap-sm"><h2>Contracts</h2><button className="btn" onClick={onCreate}>New contract</button></div>
    <div className="flex-row flex-wrap items-center gap-sm">
      <label className="field"><span>Search contracts</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="field"><span>Contract status</span><select aria-label="Contract status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="outstanding">Outstanding</option><option value="settled">Settled</option><option value="archived">Archived</option><option value="all">All contracts</option></select></label>
      <label className="field"><span>Contract sorting</span><select aria-label="Contract sorting" value={sort} onChange={(event) => setSort(event.target.value)}><option value="highest">Highest remaining first</option><option value="lowest">Lowest remaining first</option><option value="name">Name A–Z</option></select></label>
      <button className="btn" onClick={() => { setSearch(''); setStatus('outstanding'); setSort('highest'); }}>Clear contract filters</button>
    </div>
    <p>Total contract receivable: <strong>{money(entries.reduce((sum, item) => roundMoney(sum + Math.max(0, item.remaining)), 0))}</strong> · {visible.length} contracts shown</p>
    <div className="home-cards contract-cards">{visible.map(({ contract, received, remaining }) => <HomeCard key={contract.id} title={contract.name} description={contract.description}
      detail={`${contract.isActive ? '' : 'Archived · '}Total ${money(contract.totalAmount)} · Received ${money(received)} · ${contract.creditUserIds.length} linked users`}
      amount={`${money(remaining)} remaining`} tone="blue" onClick={() => onOpen(contract.id)}
      icon={<Icon size={42}><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4" /></Icon>} />)}</div>
    {!visible.length && <p role="status" className="text-muted">No contracts match these filters.</p>}
  </section>;
}
