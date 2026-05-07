export type ATOCategory =
  | 'work_from_home'
  | 'vehicle'
  | 'tools_equipment'
  | 'clothing'
  | 'education'
  | 'phone_internet'
  | 'meals_entertainment'
  | 'professional_services'
  | 'home_office'
  | 'other'

export interface Receipt {
  id: string
  user_id?: string
  merchant: string
  amount: number
  date: string
  category: ATOCategory
  work_pct: number
  notes: string
  deduction_amount: number
  tax_back_amount: number
  ai_scanned: boolean
  ocr_raw?: string
  ato_tip?: string
  confidence?: number
  fy_year: string
  created_at: string
  image_data?: string   // base64 data URL stored with the record
  image_thumb?: string  // compressed thumbnail for list view
}

export interface TaxProfile {
  marginal_rate: number
  business_type: 'individual' | 'company' | 'small_biz'
  name?: string
  abn?: string
}

export interface ScanResult {
  merchant: string
  amount: number
  date: string
  category: ATOCategory
  work_pct: number
  notes: string
  ato_deductible_pct: number
  confidence: number
  ato_tip: string
  ocr_text: string
}

export interface DashboardStats {
  total_deductions: number
  total_tax_back: number
  receipt_count: number
  ai_scanned_count: number
  by_category: Record<ATOCategory, number>
  by_month: { month: string; amount: number }[]
}
