'use client'
import { useState } from 'react'
import { Receipt, ATOCategory } from '@/types'
import { CAT_META } from '@/lib/tax'

const CAT_COLORS: Record<string, string> = {
  work_from_home: '#5eead4', vehicle: '#7eb8f7', tools_equipment: '#a78bfa',
  clothing: '#f9a8d4', education: '#6ee7b7', phone_internet: '#93c5fd',
  meals_entertainment: '#fca5a5', professional_services: '#fcd34d',
  home_office: '#86efac', other: '#9ca3af',
}

export default function ReceiptsTab({ receipts, onDelete }: { receipts: Receipt[]; onDelete: (id: string) => void }) {
  const [filter, setFilter] = useState<ATOCategory | ''>('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const list = filter ? receipts.filter(r => r.category === filter) : receipts
  const total = list.reduce((s, r) => s + r.deduction_amount, 0)

  const del = (id: string) => {
    if (confirmDel === id) { onDelete(id); setConfirmDel(null) }
    else { setConfirmDel(id); setTimeout(() => setConfirmDel(null), 2800) }
  }

  return (
    <div>
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>All receipts</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {list.length} receipt{list.length !== 1 ? 's' : ''} · <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>${Math.round(total).toLocaleString()}</span> claimed
          </div>
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value as ATOCategory | '')} style={{ width: 'auto', fontSize: 12 }}>
          <option value="">All categories</option>
          {Object.entries(CAT_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>
      </div>

      <div style={{ padding: '16px 28px' }}>
        {list.length === 0 ? (
          <div style={{ padding: '56px 24px', textAlign: 'center', color: 'var(--text-3)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 10px', display: 'block', stroke: 'var(--text-3)' }}>
              <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" strokeWidth="1.3" strokeLinejoin="round"/>
              <path d="M9 9h6M9 13h4" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>No receipts yet</div>
            <div style={{ fontSize: 12, marginTop: 3 }}>Add your first receipt to start tracking</div>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 120px 90px 28px', gap: 12, padding: '6px 12px', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', marginBottom: 2 }}>
              <div />
              <div>Merchant</div>
              <div>Category</div>
              <div style={{ textAlign: 'right' }}>Deduction</div>
              <div />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {list.map((r, i) => {
                const meta = CAT_META[r.category] || CAT_META.other
                const color = CAT_COLORS[r.category] || '#9ca3af'
                const isFirst = i === 0, isLast = i === list.length - 1, isOnly = list.length === 1
                return (
                  <div key={r.id} style={{
                    display: 'grid', gridTemplateColumns: '28px 1fr 120px 90px 28px',
                    alignItems: 'center', gap: 12, padding: '9px 12px',
                    background: 'var(--bg-2)', transition: 'background 0.12s',
                    borderRadius: isOnly ? 'var(--radius-sm)' : isFirst ? 'var(--radius-sm) var(--radius-sm) 0 0' : isLast ? '0 0 var(--radius-sm) var(--radius-sm)' : 0,
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-3)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-2)')}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 5, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.merchant}</span>
                        {r.ai_scanned && (
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', background: 'var(--accent-bg)', color: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>AI</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                        {r.date}{r.notes ? ` · ${r.notes}` : ''}
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label}</div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>${r.deduction_amount.toFixed(2)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>${r.amount.toFixed(2)} paid</div>
                    </div>

                    <button onClick={() => del(r.id)} style={{
                      width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: 'none', background: confirmDel === r.id ? 'var(--red-bg)' : 'transparent',
                      borderRadius: 4, cursor: 'pointer',
                      color: confirmDel === r.id ? 'var(--red)' : 'var(--text-3)',
                      transition: 'all 0.12s',
                    }}
                      onMouseEnter={e => { (e.currentTarget.style.background = 'var(--red-bg)'); (e.currentTarget.style.color = 'var(--red)') }}
                      onMouseLeave={e => { if (confirmDel !== r.id) { (e.currentTarget.style.background = 'transparent'); (e.currentTarget.style.color = 'var(--text-3)') } }}
                      title={confirmDel === r.id ? 'Click again to confirm delete' : 'Delete'}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"><path d="M2 3h8M5 3V2h2v1M4.5 5v4M7.5 5v4M3 3l.5 7h5l.5-7" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
