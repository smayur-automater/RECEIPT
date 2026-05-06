import { ATOCategory, Receipt, TaxProfile } from '@/types'

export const CAT_META: Record<ATOCategory, {
  label: string
  icon: string
  color: string
  deductible_pct: number
  ato_hint: string
}> = {
  work_from_home: {
    label: 'Work from home',
    icon: 'Home',
    color: '#1a6b3f',
    deductible_pct: 0.80,
    ato_hint: "Use the ATO's fixed rate of 67c/hr or actual expenses. Keep a 4-week representative diary as evidence.",
  },
  vehicle: {
    label: 'Vehicle & travel',
    icon: 'Car',
    color: '#0c447c',
    deductible_pct: 0.90,
    ato_hint: 'Log every work trip. Cents-per-km allows up to 5,000km/yr at 88c/km (FY25). Keep a logbook for actual costs.',
  },
  tools_equipment: {
    label: 'Tools & equipment',
    icon: 'Wrench',
    color: '#3d4da8',
    deductible_pct: 1.00,
    ato_hint: 'Items over $300 must be depreciated over their effective life. Under $300 — claim immediately in full.',
  },
  clothing: {
    label: 'Clothing & uniform',
    icon: 'Shirt',
    color: '#7b3ab8',
    deductible_pct: 0.85,
    ato_hint: 'Only deductible if distinctive uniform, protective, or occupation-specific. Conventional work clothing is NOT deductible.',
  },
  education: {
    label: 'Self-education',
    icon: 'BookOpen',
    color: '#0f6e56',
    deductible_pct: 0.75,
    ato_hint: 'Must directly relate to your current job — not a future career change. Course fees, textbooks, and travel are claimable.',
  },
  phone_internet: {
    label: 'Phone & internet',
    icon: 'Smartphone',
    color: '#185fa5',
    deductible_pct: 0.50,
    ato_hint: 'Keep a 4-week usage diary to establish your work-use percentage. Typical range: 25–80% for remote workers.',
  },
  meals_entertainment: {
    label: 'Meals & entertainment',
    icon: 'UtensilsCrossed',
    color: '#993c1d',
    deductible_pct: 0.50,
    ato_hint: 'Generally not deductible unless travelling overnight for work. FBT may apply to employer-provided meals.',
  },
  professional_services: {
    label: 'Professional services',
    icon: 'Briefcase',
    color: '#633806',
    deductible_pct: 0.90,
    ato_hint: 'Accountant fees and work-related legal costs are 100% deductible. Keep invoices with clear descriptions.',
  },
  home_office: {
    label: 'Home office',
    icon: 'Building2',
    color: '#3b6d11',
    deductible_pct: 0.67,
    ato_hint: 'Area method: work area ÷ total floor area × running costs. Keep a floor plan showing dedicated workspace.',
  },
  other: {
    label: 'Other deductions',
    icon: 'FileText',
    color: '#5f5e5a',
    deductible_pct: 0.80,
    ato_hint: 'Keep all receipts for 5 years. The ATO most commonly audits work-related claims over $300.',
  },
}

export function getCurrentFY(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

export function getFYLabel(fy: string): string {
  const [start, end] = fy.split('-')
  return `FY ${start}–${end.slice(2)}`
}

export function calcDeduction(amount: number, category: ATOCategory, workPct: number): number {
  const meta = CAT_META[category]
  return Math.round(amount * (workPct / 100) * meta.deductible_pct * 100) / 100
}

export function calcTaxBack(deduction: number, profile: TaxProfile): number {
  return Math.round(deduction * profile.marginal_rate * 100) / 100
}

export function enrichReceipt(
  partial: Omit<Receipt, 'deduction_amount' | 'tax_back_amount' | 'fy_year' | 'created_at' | 'id'>,
  profile: TaxProfile
): Omit<Receipt, 'id'> {
  const deduction = calcDeduction(partial.amount, partial.category, partial.work_pct)
  const tax_back = calcTaxBack(deduction, profile)
  return {
    ...partial,
    deduction_amount: deduction,
    tax_back_amount: tax_back,
    fy_year: getCurrentFY(),
    created_at: new Date().toISOString(),
  }
}

export const TAX_RATES = [
  { label: '0% (tax-free threshold)', value: 0 },
  { label: '19% (up to $45,000)', value: 0.19 },
  { label: '32.5% ($45k – $120k)', value: 0.325 },
  { label: '37% ($120k – $180k)', value: 0.37 },
  { label: '45% (over $180k)', value: 0.45 },
]

export const DEFAULT_TAX_PROFILE: TaxProfile = {
  marginal_rate: 0.325,
  business_type: 'individual',
}

export function exportToCSV(receipts: Receipt[]): string {
  const headers = ['Date','Merchant','Amount ($)','Category','Work Use %','Deduction ($)','Tax Back ($)','Notes','AI Scanned','FY Year']
  const rows = receipts.map(r => [
    r.date,
    `"${r.merchant}"`,
    r.amount.toFixed(2),
    CAT_META[r.category]?.label || r.category,
    r.work_pct,
    r.deduction_amount.toFixed(2),
    r.tax_back_amount.toFixed(2),
    `"${r.notes}"`,
    r.ai_scanned ? 'Yes' : 'No',
    r.fy_year,
  ])
  return [headers, ...rows].map(r => r.join(',')).join('\n')
}
