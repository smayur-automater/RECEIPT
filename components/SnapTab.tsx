'use client'
import { useState, useRef, useCallback } from 'react'
import { ATOCategory, Receipt, TaxProfile, ScanResult } from '@/types'
import { CAT_META, calcDeduction, calcTaxBack, getCurrentFY } from '@/lib/tax'

const CATS = Object.entries(CAT_META) as [ATOCategory, typeof CAT_META[ATOCategory]][]

const STEPS = [
  { id: 1, label: 'Uploading image',       sub: 'Sent to Google Vision' },
  { id: 2, label: 'Running OCR',           sub: 'Free · 1,000/month' },
  { id: 3, label: 'Classifying expense',   sub: 'ATO rule-based · instant' },
  { id: 4, label: 'Saving record',         sub: 'Image stored with entry' },
]

function compressImage(dataUrl: string, maxW = 1200, quality = 0.82): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = dataUrl
  })
}

function makeThumbnail(dataUrl: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const size = 80
      const scale = size / Math.max(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.65))
    }
    img.src = dataUrl
  })
}

type Flow = 'idle' | 'scanning' | 'saved' | 'edit' | 'error'

export default function SnapTab({ profile, onAdd }: { profile: TaxProfile; onAdd: (r: Receipt) => void }) {
  const [flow, setFlow]           = useState<Flow>('idle')
  const [step, setStep]           = useState(0)
  const [stepsDone, setStepsDone] = useState<number[]>([])
  const [stepSub, setStepSub]     = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [imageData, setImageData] = useState('')
  const [thumb, setThumb]         = useState('')
  const [ocrText, setOcrText]     = useState('')
  const [savedReceipt, setSavedReceipt] = useState<Receipt | null>(null)

  // Editable fields
  const [merchant, setMerchant] = useState('')
  const [amount,   setAmount]   = useState('')
  const [category, setCategory] = useState<ATOCategory>('other')
  const [workPct,  setWorkPct]  = useState('100')
  const [notes,    setNotes]    = useState('')
  const [scanResult, setScanResult] = useState<Partial<ScanResult> | null>(null)

  const fileRef   = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const done  = (id: number) => setStepsDone(p => p.includes(id) ? p : [...p, id])
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  const processImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload a JPG, PNG or WebP image.'); setFlow('error'); return
    }

    setFlow('scanning'); setStep(0); setStepsDone([]); setError(null)

    const reader = new FileReader()
    reader.onload = async (e) => {
      const raw = e.target?.result as string

      try {
        // Step 1 — compress + thumbnail in parallel
        setStep(1); setStepSub('Compressing image…')
        const [compressed, thumbData] = await Promise.all([
          compressImage(raw, 1200, 0.82),
          makeThumbnail(raw),
        ])
        setImageData(compressed)
        setThumb(thumbData)
        done(1)

        // Step 2 — send to Google Vision via our API route
        setStep(2); setStepSub('Sending to Google Vision OCR…')
        const base64 = compressed.split(',')[1]
        const res = await fetch('/api/scan-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mimeType: 'image/jpeg' }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'OCR failed')
        const r: ScanResult = data.result
        setOcrText(r.ocr_text || '')
        done(2)

        // Step 3 — classification already done server-side
        setStep(3); setStepSub('Matching ATO category…')
        await sleep(350)
        setScanResult(r)
        setMerchant(r.merchant || '')
        setAmount(r.amount?.toString() || '')
        setCategory(r.category || 'other')
        setWorkPct(r.work_pct?.toString() || '100')
        setNotes(r.notes || '')
        done(3)

        // Step 4 — build + save receipt
        setStep(4); setStepSub('Saving to tax log…')
        const amt = r.amount || 0
        const cat = r.category || 'other'
        const pct = r.work_pct || 100
        const ded = calcDeduction(amt, cat, pct)
        const tb  = calcTaxBack(ded, profile)

        const receipt: Receipt = {
          id:               crypto.randomUUID(),
          merchant:         r.merchant || 'Unknown',
          amount:           amt,
          date:             r.date || new Date().toISOString().split('T')[0],
          category:         cat,
          work_pct:         pct,
          notes:            r.notes || '',
          deduction_amount: ded,
          tax_back_amount:  tb,
          ai_scanned:       true,
          ocr_raw:          r.ocr_text,
          ato_tip:          r.ato_tip,
          confidence:       r.confidence,
          fy_year:          getCurrentFY(),
          created_at:       new Date().toISOString(),
          image_data:       compressed,
          image_thumb:      thumbData,
        }

        await sleep(300)
        done(4)
        setSavedReceipt(receipt)
        onAdd(receipt)
        setFlow('saved')

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Scan failed'
        setError(msg)
        setFlow('error')
      }
    }
    reader.readAsDataURL(file)
  }

  const handleFile = (f: File) => processImage(f)
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) processImage(f)
  }, [profile])

  const handleSaveEdits = () => {
    if (!savedReceipt) return
    const amt = parseFloat(amount) || savedReceipt.amount
    const pct = parseFloat(workPct) || savedReceipt.work_pct
    const ded = calcDeduction(amt, category, pct)
    const tb  = calcTaxBack(ded, profile)
    const updated: Receipt = { ...savedReceipt, merchant, amount: amt, category, work_pct: pct, notes, deduction_amount: ded, tax_back_amount: tb }
    setSavedReceipt(updated)
    onAdd(updated)
    setFlow('saved')
  }

  const reset = () => {
    setFlow('idle'); setError(null); setSavedReceipt(null); setScanResult(null)
    setStep(0); setStepsDone([]); setImageData(''); setThumb(''); setOcrText('')
    setMerchant(''); setAmount(''); setCategory('other'); setWorkPct('100'); setNotes('')
    if (fileRef.current)   fileRef.current.value = ''
    if (cameraRef.current) cameraRef.current.value = ''
  }

  const amt = parseFloat(amount) || 0
  const ded = amt > 0 ? calcDeduction(amt, category, parseFloat(workPct) || 100) : 0
  const tb  = ded > 0 ? calcTaxBack(ded, profile) : 0
  const meta = CAT_META[category] || CAT_META.other

  // ─── Shared styles ────────────────────────────────────────────────────
  const pageHeader = (title: string, sub: string, action?: React.ReactNode) => (
    <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>
      </div>
      {action}
    </div>
  )

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div><label style={{ display: 'block', fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 5 }}>{label}</label>{children}</div>
  )

  // ─── SCANNING ─────────────────────────────────────────────────────────
  if (flow === 'scanning') return (
    <div>
      {pageHeader('Reading receipt…', 'Google Vision OCR → ATO classifier → auto-saved')}
      <div style={{ padding: '28px', maxWidth: 520 }}>
        {imageData && (
          <img src={imageData} alt="Scanning" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 20, background: 'var(--bg-3)', opacity: 0.6 }} />
        )}
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {STEPS.map(({ id, label, sub }, i) => {
            const isDone   = stepsDone.includes(id)
            const isActive = step === id && !isDone
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: i < STEPS.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background 0.2s', background: isActive ? 'var(--accent-bg)' : 'transparent' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? 'var(--accent)' : isActive ? 'transparent' : 'var(--bg-3)', border: isActive ? '1.5px solid var(--accent-dim)' : 'none' }}>
                  {isDone
                    ? <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5L9 3" stroke="#0e0f11" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    : isActive
                      ? <div style={{ width: 10, height: 10, border: '1.5px solid var(--bg-4)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} className="spin" />
                      : <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-3)' }} />
                  }
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: isActive ? 500 : 400, color: isDone ? 'var(--text-1)' : isActive ? 'var(--text-1)' : 'var(--text-3)' }}>{label}</div>
                  <div style={{ fontSize: 11, color: isActive ? 'var(--accent-dim)' : 'var(--text-3)', marginTop: 1 }}>{isActive ? stepSub || sub : sub}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  // ─── SAVED ────────────────────────────────────────────────────────────
  if (flow === 'saved' && savedReceipt) return (
    <div>
      {pageHeader('Saved ✓', 'Receipt logged · image stored · deduction calculated')}
      <div style={{ padding: '20px 28px', maxWidth: 520 }}>
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {savedReceipt.image_thumb && (
              <img src={savedReceipt.image_thumb} alt="Receipt" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2 2L7.5 2" stroke="#0e0f11" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{savedReceipt.merchant}</span>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', background: 'var(--accent-bg)', color: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 3, padding: '1px 5px' }}>OCR</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { l: 'Paid',      v: `$${savedReceipt.amount.toFixed(2)}`,           accent: false },
                  { l: 'Deduction', v: `$${savedReceipt.deduction_amount.toFixed(2)}`, accent: true  },
                  { l: 'Tax back',  v: `$${savedReceipt.tax_back_amount.toFixed(2)}`,  accent: true  },
                ].map(s => (
                  <div key={s.l} style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{s.l}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)', color: s.accent ? 'var(--accent)' : 'var(--text-1)' }}>{s.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
                {CAT_META[savedReceipt.category]?.label} · {savedReceipt.date}
                {savedReceipt.confidence != null && ` · ${savedReceipt.confidence}% confidence`}
              </div>
            </div>
          </div>
        </div>

        {savedReceipt.ato_tip && (
          <div style={{ background: 'var(--bg-2)', borderLeft: '3px solid var(--accent)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--accent-dim)', marginBottom: 3 }}>ATO note</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>{savedReceipt.ato_tip}</div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={() => setFlow('edit')} style={{ padding: '9px', background: 'var(--bg-3)', color: 'var(--text-1)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-ui)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor"><path d="M9 2l2 2-7 7H2V9l7-7z" strokeWidth="1.3" strokeLinejoin="round"/></svg>
            Edit details
          </button>
          <button onClick={reset} style={{ padding: '9px', background: 'var(--accent)', color: '#0e0f11', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-ui)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor"><rect x="2" y="3" width="9" height="8" rx="1" strokeWidth="1.3"/><path d="M4.5 3V2M8.5 3V2" strokeWidth="1.3" strokeLinecap="round"/><circle cx="6.5" cy="7" r="1.5" strokeWidth="1.3"/></svg>
            Snap another
          </button>
        </div>
      </div>
    </div>
  )

  // ─── EDIT ─────────────────────────────────────────────────────────────
  if (flow === 'edit') return (
    <div>
      {pageHeader('Edit receipt', 'Correct any misread fields',
        <button onClick={() => setFlow('saved')} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-ui)' }}>Cancel</button>
      )}
      <div style={{ padding: '20px 28px', maxWidth: 520 }}>
        {savedReceipt?.image_data && (
          <img src={savedReceipt.image_data} alt="Receipt" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 16, background: 'var(--bg-3)' }} />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <F label="Merchant"><input type="text" value={merchant} onChange={e => setMerchant(e.target.value)} /></F>
          <F label="Amount (AUD)"><input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></F>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <F label="ATO category">
            <select value={category} onChange={e => setCategory(e.target.value as ATOCategory)} style={{ appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235a5d66'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28 }}>
              {CATS.map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </F>
          <F label="Work use %"><input type="number" min="0" max="100" value={workPct} onChange={e => setWorkPct(e.target.value)} /></F>
        </div>
        <div style={{ marginBottom: 14 }}>
          <F label="Business purpose"><input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Brief ATO audit description" /></F>
        </div>

        {amt > 0 && (
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-dim)', marginBottom: 3 }}>Deduction</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>${ded.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{Math.round(meta.deductible_pct * 100)}% deductible · {workPct}% work use</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Tax back</div>
                <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>${tb.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}

        {ocrText && (
          <details style={{ marginBottom: 14 }}>
            <summary style={{ fontSize: 11, color: 'var(--text-3)', cursor: 'pointer', userSelect: 'none', marginBottom: 4 }}>Raw OCR text</summary>
            <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', maxHeight: 80, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {ocrText}
            </div>
          </details>
        )}

        <button onClick={handleSaveEdits} style={{ width: '100%', padding: '9px', background: 'var(--accent)', color: '#0e0f11', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-ui)', cursor: 'pointer' }}>
          Save changes
        </button>
      </div>
    </div>
  )

  // ─── IDLE / ERROR ─────────────────────────────────────────────────────
  return (
    <div>
      {pageHeader('Snap a receipt', 'Photo → Google Vision OCR → ATO category → auto-saved')}
      <div style={{ padding: '20px 28px', maxWidth: 520 }}>

        {flow === 'error' && error && (
          <div style={{ display: 'flex', gap: 9, padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, background: 'var(--red-bg)', border: '1px solid rgba(255,107,107,0.2)', color: 'var(--red)', marginBottom: 16 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="7" cy="7" r="6" strokeWidth="1.3"/><path d="M7 4.5v3M7 9.5h.01" strokeWidth="1.4" strokeLinecap="round"/></svg>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 3 }}>{error}</div>
              <button onClick={reset} style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'var(--font-ui)' }}>Try again</button>
            </div>
          </div>
        )}

        {/* Camera button — primary CTA */}
        <button
          onClick={() => cameraRef.current?.click()}
          style={{ width: '100%', padding: '22px', background: 'var(--accent)', color: '#0e0f11', border: 'none', borderRadius: 'var(--radius)', fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-ui)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 10, letterSpacing: '-0.01em' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="15" rx="2"/><circle cx="12" cy="12.5" r="3.5"/><path d="M9 5l1.5-2.5h3L15 5"/>
          </svg>
          Snap receipt
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

        {/* Upload fallback */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
          style={{ border: '1px dashed var(--border-2)', borderRadius: 'var(--radius)', padding: '16px', textAlign: 'center', cursor: 'pointer', background: 'var(--bg-2)', marginBottom: 16 }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-3)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
        >
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--text-3)" style={{ margin: '0 auto 5px', display: 'block' }}><path d="M8 11V3M5 6l3-3 3 3M2 12v1a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0014 13v-1" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>Upload from files</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Drag & drop · JPG, PNG, WebP</div>
        </div>

        {/* Pipeline explainer */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
          {[
            { n: '1', t: 'Snap',        d: 'Photo taken on device', badge: 'Free' },
            { n: '2', t: 'Google OCR',  d: '1,000 req/month free',  badge: 'Free' },
            { n: '3', t: 'Auto-saved',  d: 'ATO category + image',  badge: 'Instant' },
          ].map((s, i, a) => (
            <div key={s.n} style={{ background: 'var(--bg-2)', padding: '12px', borderRadius: i === 0 ? 'var(--radius-sm) 0 0 var(--radius-sm)' : i === a.length - 1 ? '0 var(--radius-sm) var(--radius-sm) 0' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--accent-dim)', textTransform: 'uppercase' }}>Step {s.n}</span>
                <span style={{ fontSize: 8, fontWeight: 700, background: 'var(--accent-bg)', color: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 3, padding: '0px 4px', letterSpacing: '0.05em' }}>{s.badge}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{s.t}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
