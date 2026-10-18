import type { Contract, Transaction } from '../types.ts';
import { roundMoney } from '../../Ledger/ledgerModel.ts';

export function contractBalance(contract: Contract, transactions: Transaction[]) {
  const received = transactions.filter((entry) => entry.active && entry.contractId === contract.id && entry.creditUserId)
    .reduce((sum, entry) => roundMoney(sum + entry.amount), 0);
  return { received, remaining: roundMoney(contract.totalAmount - received) };
}
