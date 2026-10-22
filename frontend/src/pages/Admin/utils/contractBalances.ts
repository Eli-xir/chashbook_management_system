import type { Contract, Transaction } from '../types.ts';
import { roundMoney } from '../../Ledger/ledgerModel.ts';

export function contractContributions(contractId: string, transactions: Transaction[]) {
  const amounts = new Map<string, number>();
  for (const entry of transactions) {
    if (entry.active && entry.contractId === contractId && entry.creditUserId) {
      amounts.set(entry.creditUserId, roundMoney((amounts.get(entry.creditUserId) ?? 0) + entry.amount));
    }
  }
  return amounts;
}

export function contractBalance(contract: Contract, transactions: Transaction[]) {
  const received = transactions.filter((entry) => entry.active && entry.contractId === contract.id && entry.creditUserId)
    .reduce((sum, entry) => roundMoney(sum + entry.amount), 0);
  return { received, remaining: roundMoney(contract.totalAmount - received) };
}
