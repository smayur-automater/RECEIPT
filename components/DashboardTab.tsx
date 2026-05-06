'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Receipt, TaxProfile, ATOCategory } from '@/types'
import { CAT_META, exportToCSV, getFYLabel } from '@/lib/tax'

const CAT_COLORS: Record<string, string> = {
  work_from_home: '#5eead4', vehicle: '#7eb8f7', tools_equipment: '#a78bfa',
  clothing: '#f9a8d4', education: '#6ee7b7', phone_internet: '#93c5fd',
  meals_entertainment: '#fca5a5', professional_services: '#fcd34d',
  home_office: '#86efac', other: '#9ca3af',
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#232428', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '7px 10px', fontSize: 12 }}>
      <div style={{ color: '#9b9ea6', marginBottom: 2 }}>{label}</div>
      <div style={{ color: '#d4f57a', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>${payload[0].value}</div>
    </div>
  )
}

export default function DashboardTab({ receipts, profile, fy }: { receipts: Receipt[]; profile: TaxProfile; fy: string }) {
  const total = receipts.reduce((s, r) => s + r.deduction_amount, 0)
  const taxBack = receipts.reduce((s, r) => s + r.tax_back_amount, 0)
  const aiCount = receipts.filter(r => r.ai_scanned).length

  const byCategory = receipts.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + r.deduction_amount
    return acc
  }, {} as Record<ATOCategory, number>)
  const sortedCats = (Object.entries(byCategory) as [ATOCategory, number][]).sort((a, b) => b[1] - a[1])
  const maxCat = sortedCats[0]?.[1] || 1

  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  const monthlyData = months.map((month, i) => {
    const yr = i < 6 ? fy.split('-')[0] : fy.split('-')[1]
    const mo = String(i < 6 ? i + 7 : i - 5).padStart(2, '0')
    const prefix = `${yr}-${mo}`
    return { month, amount: Math.round(receipts.filter(r => r.date.startsWith(prefix)).reduce((s, r) => s + r.deduction_amount, 0)) }
  })

  const handleExport = () => {
    const csv = exportToCSV(receipts)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `snapclaim-${fy}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const Stat = ({ label, value, sub }: { label: string; value: string; sub: string }) => (
    <div style={{ background: 'var(--bg-2)', padding: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
    </div>
  )

  return (
    <div>
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Dashboard</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{getFYLabel(fy)} overview</div>
        </div>
        <button onClick={handleExport} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
          background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-sm)',
          fontSize: 12, fontWeight: 500, color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'var(--font-ui)',
          transition: 'background 0.12s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-4)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-3)')}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor"><path d="M6.5 1v8M3 6.5l3.5 3.5 3.5-3.5M1.5 10.5v1a1 1 0 001 1h8a1 1 0 001-1v-1" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Export CSV
        </button>
      </div>

      <div style={{ padding: '20px 28px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, marginBottom: 24 }}>
          <div style={{ ...statCardStyle, borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)' }}>
            <Stat label="Total deductions" value={`$${Math.round(total).toLocaleString()}`} sub={`${receipts.length} receipt${receipts.length !== 1 ? 's' : ''}`} />
          </div>
          <div style={statCardStyle}>
            <Stat label="Est. tax back" value={`$${Math.round(taxBack).toLocaleString()}`} sub={`@ ${Math.round(profile.marginal_rate * 100)}% marginal rate`} />
          </div>
          <div style={{ ...statCardStyle, borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' }}>
            <Stat label="AI scanned" value={String(aiCount)} sub="receipts via Claude" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Category breakdown */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>By ATO category</div>
            {sortedCats.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0' }}>No data yet.</div>
            ) : sortedCats.map(([cat, amt]) => (
              <div key={cat} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 52px', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{CAT_META[cat].label}</div>
                <div style={{ height: 3, background: 'var(--bg-4)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(amt / maxCat * 100)}%`, background: CAT_COLORS[cat] || '#9ca3af', borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', textAlign: 'right' }}>${Math.round(amt)}</div>
              </div>
            ))}
          </div>

          {/* Monthly chart */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Monthly deductions</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlyData} margin={{ top: 0, right: 0, bottom: 0, left: -28 }}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#5a5d66' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#5a5d66', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="amount" radius={[2, 2, 0, 0]}>
                  {monthlyData.map((e, i) => <Cell key={i} fill={e.amount > 0 ? '#d4f57a' : '#1c1d20'} fillOpacity={e.amount > 0 ? 0.7 : 1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ATO tip */}
        <div style={{ background: 'var(--bg-2)', borderLeft: '3px solid var(--accent)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--accent-dim)', marginBottom: 4 }}>ATO tip · FY25</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>
            Working from home fixed rate is <strong style={{ color: 'var(--text-1)' }}>67 cents per hour</strong>. Log your hours now — 1,600 hrs/yr = <strong style={{ color: 'var(--text-1)' }}>$1,072 claimable</strong> with no receipts required.
          </div>
        </div>
      </div>
    </div>
  )
}

const statCardStyle: React.CSSProperties = { background: 'var(--bg-2)', padding: 0, overflow: 'hidden' }
