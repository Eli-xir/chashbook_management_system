// src/pages/Admin/types.ts
export type TransactionDirection = 'debit' | 'credit' | 'both';

export interface Head {
  head_id: number;
  parent_head_id: number | null;
  head_name: string;
  head_description?: string;
  is_active: boolean;
  is_transactionable: boolean;
}

export interface HeadNode extends Head {
  children: HeadNode[];
}

export interface AdminUser {
  user_id: string;
  user_name: string;
  contact_no?: string;
  is_active: boolean;
}

export interface FiltersState {
  dateFrom: string;
  dateTo: string;
  userScope: string | 'all';
  direction: TransactionDirection;
}

export type MoveChange = {
  op: 'move';
  head_id: number;
  new_parent_id: number | null;
};

export type MergeChange = {
  op: 'merge';
  source_head_id: number;
  target_head_id: number;
};

export type StagedChange = MoveChange | MergeChange;

export type SidebarTab = 'filters' | 'heads' | 'users';