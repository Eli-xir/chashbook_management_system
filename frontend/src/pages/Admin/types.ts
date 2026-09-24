// src/pages/Admin/types.ts
export type TransactionDirection = 'debit' | 'credit' | 'both';

export interface Head {
  head_id: number;
  parent_head_id: number | null;
  head_name: string;
  head_description?: string;
  attachment_id?: number | null;
  image_url?: string | null;
  is_active: boolean;
  is_transactionable: boolean;
}

export interface HeadNode extends Head {
  children: HeadNode[];
}

export interface AdminUser {
  role?: 'admin' | 'user';
  user_id: string;
  user_name: string;
  contact_no?: string;
  contacts?: string[];
  is_active: boolean;
}

export interface FiltersState {
  headId?: number | null;
  dateFrom: string;
  dateTo: string;
  userScope: string;
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
  backup?: boolean;
};
export type CreateChange = {
  op: 'create';
  temp_id: number;
  head_name: string;
  parent_head_id: number | null;
  is_transactionable?: boolean;
};

export type EditHeadChange = {
  op: 'edit';
  head_id: number;
  head_name: string;
  image_url: string | null;
  is_transactionable: boolean;
};

export type DeleteHeadChange = {
  op: 'delete';
  head_id: number;
};

export type ActiveHeadChange = { op: 'active'; head_id: number; is_active: boolean; };
export type BackupHeadChange = { op: 'backup'; head_id: number; };
export type StagedChange = MoveChange | MergeChange | CreateChange | EditHeadChange | DeleteHeadChange | ActiveHeadChange | BackupHeadChange;
export type Permissions = Record<string, number[]>;
export interface AdminData { heads: Head[]; users: AdminUser[]; permissions: Permissions; categories?: Category[]; }
export interface UserProfile { user_name: string; contacts: string[]; }
export interface CreateUserInput extends UserProfile { password: string; }
export interface Attachment { id: string; kind: 'image' | 'voice'; name: string; url: string; }
export interface Category { id: number; name: string; }
export interface TransactionInput { amount: number; categoryId: number; headId: number; attachments: Attachment[]; transactionTypeId?: number; }
export interface TransactionRevision extends TransactionInput {
  versionId: string; recordedAt: string; editorId: string; action: string; active: boolean;
  headPath?: string; categoryName?: string;
}
export interface Transaction extends TransactionInput {
  id: string; userId: string; createdBy: string; active: boolean; createdAt: string;
  versions?: TransactionRevision[];
  headPath?: string; categoryName?: string;
}
export interface AppSession { userId: string; role: 'admin' | 'user'; }
export interface AccountTotals { totalReceived: number; totalBillPayment: number; remainingPayable: number; }
export interface UserOverview extends AccountTotals { balance: number; credits: Transaction[]; categories: Category[]; }
export interface CashbookData extends AdminData {
  transactions: Transaction[];
}

export type SidebarTab = 'filters' | 'heads' | 'users';
export type UserAction = 'deactivate' | 'reactivate' | 'delete';
