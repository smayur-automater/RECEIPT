'use client'

import { Download, Lightbulb } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Receipt, TaxProfile, ATOCategory } from '@/types'
import { CAT_META, exportToCSV, getFYLabel } from '@/lib/tax'

interface Props {
  receipts: Receipt[]
  profile: TaxProfile
  fy: string
}

export default function DashboardTab({ receipts, profile, fy }: Props) {
  const totalDeductions = receipts.reduce((s, r) => s + r.deduction_amount, 0)
  const totalTaxBack = receipts.reduce((s, r) => s + r.tax_back_amount, 0)
  const aiCount = receipts.filter(r => r.ai_scanned).length

  // By category
  const byCategory = receipts.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + r.deduction_amount
    return acc
  }, {} as Record<ATOCategory, number>)
  const sortedCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]) as [ATOCategory, number][]
  const maxCat = sortedCats[0]?.[1] || 1

  // Monthly data (Jul–Jun)
  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  const monthlyData = months.map((month, i) => {
    const yr = i < 6 ? fy.split('-')[0] : fy.split('-')[1]
    const mo = String(i < 6 ? i + 7 : i - 5).padStart(2, '0')
    const prefix = `${yr}-${mo}`
    const amount = Math.round(receipts.filter(r => r.date.startsWith(prefix)).reduce((s, r) => s + r.deduction_amount, 0))
    return { month, amount }
  })

  const handleExport = () => {
    const csv = exportToCSV(receipts)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `snapclaim-${fy}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total deductions', value: `$${Math.round(totalDeductions).toLocaleString()}`, sub: `${receipts.length} receipts` },
          { label: 'Est. tax back', value: `$${Math.round(totalTaxBack).toLocaleString()}`, sub: `@ ${Math.round(profile.marginal_rate * 100)}% rate` },
          { label: 'AI scanned', value: String(aiCount), sub: 'via Claude' },
        ].map(s => (
          <div key={s.label} className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{s.label}</p>
            <p className="text-xl font-extrabold font-mono mt-1">{s.value}</p>
            <p className="text-xs text-green-700 font-medium mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Export button */}
      <button onClick={handleExport} className="w-full flex items-center justify-center gap-2 py-2.5 border border-green-300 bg-green-50 text-green-700 rounded-xl text-sm font-semibold hover:bg-green-100 transition-colors">
        <Download size={15} /> Export {getFYLabel(fy)} as CSV (ATO-ready)
      </button>

      {/* By category */}
      {sortedCats.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">By ATO category</p>
          <div className="space-y-2">
            {sortedCats.map(([cat, amt]) => {
              const meta = CAT_META[cat]
              return (
                <div key={cat} className="flex items-center gap-3">
                  <p className="text-xs text-gray-700 w-36 flex-shrink-0 truncate">{meta.label}</p>
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.round(amt / maxCat * 100)}%`, backgroundColor: meta.color }} />
                  </div>
                  <p className="text-xs font-mono font-semibold w-14 text-right">${Math.round(amt)}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Monthly bar chart */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Monthly deductions</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={monthlyData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
            <Tooltip formatter={(v: number) => [`$${v}`, 'Deductions']} />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
              {monthlyData.map((entry, i) => (
                <Cell key={i} fill={entry.amount > 0 ? '#1a6b3f' : '#e5e7eb'} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ATO tip */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <p className="text-xs font-bold text-green-700 mb-1.5 flex items-center gap-1.5">
          <Lightbulb size={13} /> ATO tip of the week
        </p>
        <p className="text-sm text-gray-800">
          The ATO's fixed rate for working from home is <strong>67 cents/hour</strong>. A full-time remote worker logging 1,600 hrs/yr can claim <strong>$1,072</strong> — no receipts required, just a timesheet.
        </p>
      </div>
    </div>
  )
}
