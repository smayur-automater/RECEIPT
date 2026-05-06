'use client'
import { useState, useEffect } from 'react'
import SnapTab from '@/components/SnapTab'
import ReceiptsTab from '@/components/ReceiptsTab'
import DashboardTab from '@/components/DashboardTab'
import SettingsTab from '@/components/SettingsTab'
import { Receipt, TaxProfile } from '@/types'
import { DEFAULT_TAX_PROFILE, getCurrentFY, getFYLabel } from '@/lib/tax'

type Tab = 'snap' | 'receipts' | 'dashboard' | 'settings'

const NAV = [
  { id: 'snap' as Tab, label: 'Add receipt', icon: (
    <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.5" strokeWidth="1.2" strokeLinecap="round"/><circle cx="8" cy="8" r="2.2" strokeWidth="1.2"/><path d="M6 3V2M10 3V2" strokeWidth="1.2" strokeLinecap="round"/></svg>
  )},
  { id: 'receipts' as Tab, label: 'All receipts', icon: (
    <svg viewBox="0 0 16 16" fill="none"><path d="M3 2h10v12l-2-1.5L9 14l-2-1.5L5 14 3 12.5V2z" strokeWidth="1.2" strokeLinejoin="round"/><path d="M6 6h4M6 9h3" strokeWidth="1.2" strokeLinecap="round"/></svg>
  )},
  { id: 'dashboard' as Tab, label: 'Dashboard', icon: (
    <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="8" width="3" height="6" rx="0.75" strokeWidth="1.2"/><rect x="6.5" y="5" width="3" height="9" rx="0.75" strokeWidth="1.2"/><rect x="11" y="2" width="3" height="12" rx="0.75" strokeWidth="1.2"/></svg>
  )},
  { id: 'settings' as Tab, label: 'Settings', icon: (
    <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" strokeWidth="1.2"/><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.5 3.5l1 1M11.5 11.5l1 1M12.5 3.5l-1 1M4.5 11.5l-1 1" strokeWidth="1.2" strokeLinecap="round"/></svg>
  )},
]

export default function Home() {
  const [tab, setTab] = useState<Tab>('snap')
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [profile, setProfile] = useState<TaxProfile>(DEFAULT_TAX_PROFILE)
  const fy = getCurrentFY()

  useEffect(() => {
    try {
      const s = localStorage.getItem('sc_receipts')
      if (s) setReceipts(JSON.parse(s))
      const p = localStorage.getItem('sc_profile')
      if (p) setProfile(JSON.parse(p))
    } catch {}
  }, [])

  const saveReceipts = (r: Receipt[]) => {
    setReceipts(r)
    localStorage.setItem('sc_receipts', JSON.stringify(r))
  }
  const saveProfile = (p: TaxProfile) => {
    setProfile(p)
    localStorage.setItem('sc_profile', JSON.stringify(p))
  }
  const addReceipt = (r: Receipt) => { saveReceipts([r, ...receipts]); setTab('receipts') }
  const deleteReceipt = (id: string) => saveReceipts(receipts.filter(r => r.id !== id))

  const fyReceipts = receipts.filter(r => r.fy_year === fy)
  const totalSaved = fyReceipts.reduce((s, r) => s + r.tax_back_amount, 0)
  const totalClaimed = fyReceipts.reduce((s, r) => s + r.deduction_amount, 0)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--font-ui)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, flexShrink: 0,
        background: 'var(--bg-2)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            width: 30, height: 30, background: 'var(--accent)',
            borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 10,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h7M2 10h5" stroke="#0e0f11" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>SnapClaim</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>ATO Tax Tracker</div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '8px', flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', padding: '8px 8px 4px' }}>Workspace</div>
          {NAV.map(({ id, label, icon }) => (
            <button key={id} onClick={() => setTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 8px', borderRadius: 'var(--radius-sm)',
              fontSize: 13, fontWeight: tab === id ? 500 : 400,
              color: tab === id ? 'var(--accent)' : 'var(--text-2)',
              background: tab === id ? 'var(--accent-bg)' : 'transparent',
              border: tab === id ? '1px solid var(--accent-border)' : '1px solid transparent',
              cursor: 'pointer', width: '100%', textAlign: 'left',
              transition: 'all 0.12s', marginBottom: 1,
            }}
              onMouseEnter={e => { if (tab !== id) { (e.currentTarget as HTMLElement).style.background = 'var(--bg-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-1)' } }}
              onMouseLeave={e => { if (tab !== id) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' } }}
            >
              <span style={{ width: 15, height: 15, flexShrink: 0, display: 'flex', color: tab === id ? 'var(--accent)' : 'currentColor' }}>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        {/* Footer stats */}
        <div style={{ padding: '10px 10px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', padding: '0 6px 8px', letterSpacing: '0.04em' }}>
            {getFYLabel(fy)} · {fyReceipts.length} receipts
          </div>
          <div style={{
            padding: '10px 10px', background: 'var(--accent-bg)',
            border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Est. tax back</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>
              ${Math.round(totalSaved).toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>${Math.round(totalClaimed).toLocaleString()} claimed</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, background: 'var(--bg)', overflow: 'auto' }}>
        {tab === 'snap' && <SnapTab profile={profile} onAdd={addReceipt} />}
        {tab === 'receipts' && <ReceiptsTab receipts={fyReceipts} onDelete={deleteReceipt} />}
        {tab === 'dashboard' && <DashboardTab receipts={fyReceipts} profile={profile} fy={fy} />}
        {tab === 'settings' && <SettingsTab profile={profile} onSave={saveProfile} />}
      </main>
    </div>
  )
}
