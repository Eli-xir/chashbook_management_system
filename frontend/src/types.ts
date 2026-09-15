export type Role = 'admin' | 'debit_user' | 'credit_user'

export interface Me {
  user_id: string
  username: string
  role: Role
}

export interface Head {
  head_id: number
  parent_head_id: number | null
  head_name: string
  head_description: string | null
  is_active: boolean
  is_transactionable: boolean
  image_id: number | null
  granted: boolean
  children: Head[]
}

export interface HeadFlat {
  head_id: number
  parent_head_id: number | null
  head_name: string
  head_description: string | null
  is_active: boolean
  is_transactionable: boolean
  image_id: number | null
}

export interface TransactionType {
  transaction_type_id: number
  transaction_type_name: string
}

export interface PaymentMedium {
  payment_medium_id: number
  payment_medium_name: string
  reference_count?: number
}

export interface ReportRow {
  transaction_id: number
  head_id: number
  head_name: string
  user_name: string
  user_id: string
  is_active: boolean
  reported_at: string
  transaction_amount: number
  transaction_type_name: string
  payment_medium_name: string
  image_id: number | null
  voice_id: number | null
  current_version_id: number
}

export interface ReportTotals {
  credit_total: number
  debit_total: number
  balance: number
  inactive_credit_total: number
  inactive_debit_total: number
  inactive_balance: number
  active_count: number
  inactive_count: number
  includes_inactive: boolean
}

export interface ReportResponse {
  rows: ReportRow[]
  totals: ReportTotals
  page: number
  page_size: number
}

export interface TxnVersion {
  version_id: number
  transaction_amount: number
  payment_medium_id: number
  payment_medium_name: string
  image_id: number | null
  voice_id: number | null
  transaction_type_id: number
  transaction_type_name: string
  created_at: string
}

export interface TxnDetail {
  transaction_id: number
  head_id: number
  user_id: string
  is_active: boolean
  current_version_id: number
  user_name: string
  head_name: string
  head_path: { head_id: number; head_name: string }[]
  versions: TxnVersion[]
}

export interface AdminUser {
  user_id: string
  user_name: string
  user_role_id?: number
  is_active?: boolean
  user_role_name: string
  recovery_number: string | null
  active_sessions?: number
}

export interface UserContacts {
  contact_id: number
  contact_no: string
}

export interface UserDetail extends AdminUser {
  contacts: UserContacts[]
}
