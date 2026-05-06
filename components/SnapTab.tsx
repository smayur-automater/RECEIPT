'use client'
import { useState, useRef, useCallback } from 'react'
import { ATOCategory, Receipt, TaxProfile, ScanResult } from '@/types'
import { CAT_META, calcDeduction, calcTaxBack, getCurrentFY } from '@/lib/tax'

const CATS = Object.entries(CAT_META) as [ATOCategory, typeof CAT_META[ATOCategory]][]

export default function SnapTab({ profile, onAdd }: { profile: TaxProfile; onAdd: (r: Receipt) => void }) {
  const [dragging, setDragging] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [step, setStep] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<Partial<ScanResult> | null>(null)
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ATOCategory | ''>('')
  const [workPct, setWorkPct] = useState('100')
  const [notes, setNotes] = useState('')
  const [ocrText, setOcrText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const STEPS = ['Decoding image', 'Extracting receipt data', 'Matching ATO category', 'Calculating deduction']

  const animateSteps = async () => {
    for (let i = 1; i <= 4; i++) { setStep(i); await new Promise(r => setTimeout(r, 850)) }
  }

  const scanImage = async (base64: string, mimeType: string) => {
    setError(null); setScanning(true); setStep(0)
    const anim = animateSteps()
    try {
      const res = await fetch('/api/scan-receipt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      })
      await anim
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Scan failed'); return }
      const r: ScanResult = data.result
      setScanResult(r); setMerchant(r.merchant || ''); setAmount(r.amount?.toString() || '')
      setCategory(r.category || 'other'); setWorkPct(r.work_pct?.toString() || '100')
      setNotes(r.notes || ''); setOcrText(r.ocr_text || '')
    } catch (e: unknown) {
      await anim; setError(e instanceof Error ? e.message : 'Network error')
    } finally { setScanning(false); setStep(0) }
  }

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please upload a JPG, PNG or WebP image.'); return }
    const reader = new FileReader()
    reader.onload = e => {
      const url = e.target?.result as string
      setPreview(url)
      scanImage(url.split(',')[1], file.type)
    }
    reader.readAsDataURL(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [])

  const amt = parseFloat(amount) || 0
  const cat = (category || 'other') as ATOCategory
  const pct = parseFloat(workPct) || 100
  const deduction = amt > 0 ? calcDeduction(amt, cat, pct) : 0
  const taxBack = amt > 0 ? calcTaxBack(deduction, profile) : 0
  const meta = CAT_META[cat]

  const handleAdd = () => {
    if (!merchant.trim() || !amt) { setError('Merchant name and amount are required.'); return }
    const receipt: Receipt = {
      id: crypto.randomUUID(), merchant: merchant.trim(), amount: amt,
      date: new Date().toISOString().split('T')[0], category: cat,
      work_pct: pct, notes: notes.trim(), deduction_amount: deduction,
      tax_back_amount: taxBack, ai_scanned: !!scanResult,
      ocr_raw: ocrText, ato_tip: scanResult?.ato_tip,
      confidence: scanResult?.confidence, fy_year: getCurrentFY(),
      created_at: new Date().toISOString(),
    }
    onAdd(receipt)
    setMerchant(''); setAmount(''); setCategory(''); setWorkPct('100'); setNotes('')
    setPreview(null); setScanResult(null); setOcrText(''); setError(null)
  }

  const Row = ({ children, cols }: { children: React.ReactNode; cols?: string }) => (
    <div style={{ display: 'grid', gridTemplateColumns: cols || '1fr 1fr', gap: 10, marginBottom: 10 }}>{children}</div>
  )
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div><label>{label}</label>{children}</div>
  )

  return (
    <div>
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Add receipt</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Upload an image or enter manually</div>
        </div>
      </div>
      <div style={{ padding: '20px 28px', maxWidth: 560 }}>

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            border: `1px dashed ${dragging ? 'var(--accent-dim)' : 'var(--border-2)'}`,
            borderRadius: 'var(--radius)', padding: '24px', textAlign: 'center',
            cursor: 'pointer', transition: 'all 0.15s', marginBottom: 16,
            background: dragging ? 'var(--accent-bg)' : 'var(--bg-2)',
          }}
        >
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ margin: '0 auto 8px', display: 'block', stroke: dragging ? 'var(--accent-dim)' : 'var(--text-3)' }}>
            <path d="M10 13V4M6 7l4-4 4 4M4 14v1a2 2 0 002 2h8a2 2 0 002-2v-1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', marginBottom: 2 }}>Upload receipt image</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>JPG, PNG, WebP · Claude reads it instantly</div>
        </div>

        {/* Preview */}
        {preview && !scanning && (
          <img src={preview} alt="Receipt" style={{ width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 14, background: 'var(--bg-3)' }} />
        )}

        {/* Scanning */}
        {scanning && (
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 14, height: 14, border: '1.5px solid var(--bg-4)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} className="spin" />
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>Analysing receipt with Claude…</span>
            </div>
            {STEPS.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 11,
                color: i + 1 < step ? 'var(--accent)' : i + 1 === step ? 'var(--text-1)' : 'var(--text-3)',
                fontWeight: i + 1 === step ? 500 : 400 }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', flexShrink: 0, background: i + 1 < step ? 'var(--accent)' : i + 1 === step ? 'var(--text-1)' : 'var(--text-3)' }} />
                {s}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', gap: 8, padding: '9px 11px', borderRadius: 'var(--radius-sm)', fontSize: 12, background: 'var(--red-bg)', border: '1px solid rgba(255,107,107,0.2)', color: 'var(--red)', marginBottom: 12 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, marginTop: 1, stroke: 'currentColor' }}>
              <circle cx="6.5" cy="6.5" r="5.5" strokeWidth="1.2"/><path d="M6.5 4v3M6.5 9h.01" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '14px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          or enter manually
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Form */}
        <Row>
          <Field label="Merchant"><input type="text" placeholder="e.g. Officeworks" value={merchant} onChange={e => setMerchant(e.target.value)} /></Field>
          <Field label="Amount (AUD)"><input type="number" placeholder="0.00" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
        </Row>
        <Row>
          <Field label="ATO category">
            <select value={category} onChange={e => setCategory(e.target.value as ATOCategory)}>
              <option value="">— select —</option>
              {CATS.map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Work use %"><input type="number" min="0" max="100" value={workPct} onChange={e => setWorkPct(e.target.value)} /></Field>
        </Row>
        <div style={{ marginBottom: 14 }}>
          <Field label="Business purpose"><input type="text" placeholder="Brief ATO audit description" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        </div>

        {/* OCR text */}
        {ocrText && (
          <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', maxHeight: 64, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 12 }}>
            {ocrText}
          </div>
        )}

        {/* Result */}
        {amt > 0 && (
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-dim)', marginBottom: 4 }}>Estimated deduction</div>
                <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  ${deduction.toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>
                  {Math.round(meta.deductible_pct * 100)}% deductible · {pct}% work use
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Tax back</div>
                <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>${taxBack.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>@ {Math.round(profile.marginal_rate * 100)}%</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>{meta.label}</span>
              {scanResult && (
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'var(--accent-bg)', color: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 3, padding: '1px 5px' }}>AI</span>
              )}
            </div>
            {scanResult?.confidence != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', width: 70 }}>Confidence</span>
                <div style={{ flex: 1, height: 2, background: 'var(--bg-4)', borderRadius: 1, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${scanResult.confidence}%`, background: 'var(--accent)', transition: 'width 0.5s ease' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', width: 32, textAlign: 'right' }}>{scanResult.confidence}%</span>
              </div>
            )}
          </div>
        )}

        {/* ATO hint */}
        {category && CAT_META[category as ATOCategory] && (
          <div style={{ background: 'var(--bg-2)', borderLeft: '3px solid var(--accent)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--accent-dim)', marginBottom: 3 }}>ATO note</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>
              {scanResult?.ato_tip || CAT_META[category as ATOCategory].ato_hint}
            </div>
          </div>
        )}

        <button onClick={handleAdd} style={{
          width: '100%', padding: '9px 16px', background: 'var(--accent)', color: '#0e0f11',
          border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
          fontFamily: 'var(--font-ui)', cursor: 'pointer', transition: 'opacity 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 2v9M2 6.5h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          Add to tax log
        </button>
      </div>
    </div>
  )
}
