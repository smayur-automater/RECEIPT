'use client'
import { useState } from 'react'
import { TaxProfile } from '@/types'
import { TAX_RATES } from '@/lib/tax'

export default function SettingsTab({ profile, onSave }: { profile: TaxProfile; onSave: (p: TaxProfile) => void }) {
  const [rate, setRate] = useState(profile.marginal_rate.toString())
  const [bizType, setBizType] = useState(profile.business_type)
  const [name, setName] = useState(profile.name || '')
  const [abn, setAbn] = useState(profile.abn || '')
  const [saved, setSaved] = useState(false)

  const save = () => {
    onSave({ marginal_rate: parseFloat(rate), business_type: bizType as TaxProfile['business_type'], name, abn })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const Card = ({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) => (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: desc ? 3 : 12 }}>{title}</div>
      {desc && <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 14 }}>{desc}</div>}
      {children}
    </div>
  )

  const Row2 = ({ children }: { children: React.ReactNode }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>{children}</div>
  )
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div><label>{label}</label>{children}</div>
  )

  return (
    <div>
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Settings</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Tax profile and integrations</div>
      </div>

      <div style={{ padding: '20px 28px', maxWidth: 520 }}>
        <Card title="Tax profile">
          <Row2>
            <Field label="Marginal tax rate">
              <select value={rate} onChange={e => setRate(e.target.value)}>
                {TAX_RATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Entity type">
              <select value={bizType} onChange={e => setBizType(e.target.value as TaxProfile['business_type'])}>
                <option value="individual">Individual / Sole trader</option>
                <option value="company">Company (30%)</option>
                <option value="small_biz">Small business (25%)</option>
              </select>
            </Field>
          </Row2>
          <Row2>
            <Field label="Full name"><input type="text" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} /></Field>
            <Field label="ABN"><input type="text" placeholder="12 345 678 901" value={abn} onChange={e => setAbn(e.target.value)} /></Field>
          </Row2>
        </Card>

        <Card title="Database" desc="Set these in .env.local to enable persistent storage and cross-device sync.">
          <div style={{ marginBottom: 8 }}>
            <label>NEXT_PUBLIC_SUPABASE_URL</label>
            <input type="text" readOnly value="https://your-project.supabase.co" style={{ opacity: 0.5 }} />
          </div>
          <div>
            <label>NEXT_PUBLIC_SUPABASE_ANON_KEY</label>
            <input type="text" readOnly value="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." style={{ opacity: 0.5 }} />
          </div>
        </Card>

        <Card title="Anthropic API" desc="Required for AI-powered receipt scanning. Set ANTHROPIC_API_KEY in your environment variables — never in client code.">
          <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--accent-dim)"><rect x="2" y="5.5" width="9" height="6" rx="1" strokeWidth="1.2"/><path d="M4.5 5.5V3.5a2 2 0 014 0v2" strokeWidth="1.2" strokeLinecap="round"/></svg>
            <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', background: 'none', border: 'none', padding: 0 }}>ANTHROPIC_API_KEY=sk-ant-api03-•••••••••••</code>
          </div>
        </Card>

        <div style={{ background: 'var(--bg-2)', borderLeft: '3px solid var(--amber)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', padding: '10px 12px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 3 }}>Data & privacy</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55 }}>
            In this demo, data is stored in localStorage only. With Supabase enabled, all data is encrypted at rest with row-level security. Receipt images are sent directly to Anthropic for OCR and never stored server-side.
          </div>
        </div>

        <button onClick={save} style={{
          padding: '9px 18px', background: saved ? 'var(--accent-bg)' : 'var(--accent)',
          color: saved ? 'var(--accent)' : '#0e0f11',
          border: saved ? '1px solid var(--accent-border)' : '1px solid transparent',
          borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
          fontFamily: 'var(--font-ui)', cursor: 'pointer', transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {saved ? (
            <><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor"><path d="M2 7l3.5 3.5L11 4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg> Saved</>
          ) : 'Save settings'}
        </button>
      </div>
    </div>
  )
}
