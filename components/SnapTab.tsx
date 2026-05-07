'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { ATOCategory, Receipt, TaxProfile, ScanResult } from '@/types'
import { CAT_META, calcDeduction, calcTaxBack, getCurrentFY } from '@/lib/tax'

declare global {
  interface Window {
    Tesseract: {
      createWorker: (lang: string, oem?: number, opts?: Record<string, unknown>) => Promise<{
        recognize: (img: string) => Promise<{ data: { text: string; confidence: number } }>
        terminate: () => Promise<void>
      }>
    }
  }
}

const CATS = Object.entries(CAT_META) as [ATOCategory, typeof CAT_META[ATOCategory]][]

// Compress image to a small thumbnail for storage in localStorage
function compressImage(dataUrl: string, maxW = 800, quality = 0.7): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = dataUrl
  })
}

function makeThumbnail(dataUrl: string): Promise<string> {
  return compressImage(dataUrl, 120, 0.6)
}

type FlowState = 'idle' | 'scanning' | 'review' | 'saving' | 'saved' | 'error'

interface ScanState {
  step: number
  stepDone: number[]
  ocrText: string
  ocrConfidence: number
  imageData: string
  thumb: string
  result: Partial<ScanResult> | null
}

const STEPS = [
  'Loading OCR engine',
  'Reading receipt text',
  'Classifying ATO category',
  'Auto-saving record',
]

export default function SnapTab({ profile, onAdd }: { profile: TaxProfile; onAdd: (r: Receipt) => void }) {
  const [flow, setFlow] = useState<FlowState>('idle')
  const [scan, setScan] = useState<ScanState>({ step: 0, stepDone: [], ocrText: '', ocrConfidence: 0, imageData: '', thumb: '', result: null })
  const [error, setError] = useState<string | null>(null)
  const [savedReceipt, setSavedReceipt] = useState<Receipt | null>(null)
  const [tesseractReady, setTesseractReady] = useState(false)

  // Review fields (editable before final save)
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ATOCategory>('other')
  const [workPct, setWorkPct] = useState('100')
  const [notes, setNotes] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.Tesseract) { setTesseractReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js'
    s.onload = () => setTesseractReady(true)
    document.head.appendChild(s)
  }, [])

  const setStep = (n: number) => setScan(prev => ({ ...prev, step: n }))
  const markDone = (n: number) => setScan(prev => ({ ...prev, stepDone: prev.stepDone.includes(n) ? prev.stepDone : [...prev.stepDone, n] }))

  const processImage = async (dataUrl: string) => {
    setFlow('scanning')
    setError(null)
    setScan({ step: 0, stepDone: [], ocrText: '', ocrConfidence: 0, imageData: dataUrl, thumb: '', result: null })

    try {
      // Compress image for storage in parallel
      const [compressed, thumb] = await Promise.all([
        compressImage(dataUrl, 1200, 0.8),
        makeThumbnail(dataUrl),
      ])

      // Step 1 — load Tesseract
      setStep(1)
      if (!window.Tesseract) throw new Error('OCR engine not loaded. Refresh and try again.')
      const worker = await window.Tesseract.createWorker('eng', 1, { logger: () => {} })
      markDone(1)

      // Step 2 — OCR on device (free, private)
      setStep(2)
      const result = await worker.recognize(dataUrl)
      const ocrText = result.data.text.trim()
      const ocrConf = Math.round(result.data.confidence)
      await worker.terminate()
      setScan(prev => ({ ...prev, ocrText, ocrConfidence: ocrConf, imageData: compressed, thumb }))
      markDone(2)

      if (!ocrText || ocrText.length < 8) {
        throw new Error('No text found in image. Try better lighting or a clearer photo.')
      }

      // Step 3 — Claude Haiku classifies
      setStep(3)
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocrText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Classification failed')
      const r: ScanResult = data.result
      markDone(3)

      // Pre-fill review fields
      setMerchant(r.merchant || '')
      setAmount(r.amount?.toString() || '')
      setCategory(r.category || 'other')
      setWorkPct(r.work_pct?.toString() || '100')
      setNotes(r.notes || '')
      setScan(prev => ({ ...prev, result: { ...r, confidence: Math.min(ocrConf, r.confidence ?? ocrConf) } }))

      // Step 4 — auto-save immediately
      setStep(4)
      const amt = r.amount || 0
      const cat = r.category || 'other'
      const pct = r.work_pct || 100
      const ded = calcDeduction(amt, cat, pct)
      const tb = calcTaxBack(ded, profile)

      const receipt: Receipt = {
        id: crypto.randomUUID(),
        merchant: r.merchant || 'Unknown',
        amount: amt,
        date: r.date || new Date().toISOString().split('T')[0],
        category: cat,
        work_pct: pct,
        notes: r.notes || '',
        deduction_amount: ded,
        tax_back_amount: tb,
        ai_scanned: true,
        ocr_raw: ocrText,
        ato_tip: r.ato_tip,
        confidence: Math.min(ocrConf, r.confidence ?? ocrConf),
        fy_year: getCurrentFY(),
        created_at: new Date().toISOString(),
        image_data: compressed,
        image_thumb: thumb,
      }

      await new Promise(resolve => setTimeout(resolve, 400))
      markDone(4)
      setSavedReceipt(receipt)
      onAdd(receipt)
      setFlow('saved')

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scan failed. Enter details manually.')
      setFlow('error')
    }
  }

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please upload a JPG, PNG or WebP image.'); return }
    const reader = new FileReader()
    reader.onload = e => processImage(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [profile])

  const handleEdit = () => {
    if (!savedReceipt) return
    setFlow('review')
  }

  const handleSaveEdits = () => {
    if (!savedReceipt) return
    const amt = parseFloat(amount) || savedReceipt.amount
    const pct = parseFloat(workPct) || savedReceipt.work_pct
    const ded = calcDeduction(amt, category, pct)
    const tb = calcTaxBack(ded, profile)
    const updated: Receipt = {
      ...savedReceipt,
      merchant: merchant || savedReceipt.merchant,
      amount: amt, category, work_pct: pct,
      notes, deduction_amount: ded, tax_back_amount: tb,
    }
    setSavedReceipt(updated)
    onAdd(updated) // parent dedupes by id
    setFlow('saved')
  }

  const reset = () => {
    setFlow('idle'); setError(null); setSavedReceipt(null)
    setScan({ step: 0, stepDone: [], ocrText: '', ocrConfidence: 0, imageData: '', thumb: '', result: null })
    setMerchant(''); setAmount(''); setCategory('other'); setWorkPct('100'); setNotes('')
    if (fileRef.current) fileRef.current.value = ''
    if (cameraRef.current) cameraRef.current.value = ''
  }

  const amt = parseFloat(amount) || 0
  const ded = amt > 0 ? calcDeduction(amt, category, parseFloat(workPct) || 100) : 0
  const tb = ded > 0 ? calcTaxBack(ded, profile) : 0
  const meta = CAT_META[category] || CAT_META.other

  // ── SAVED state ──────────────────────────────────────────────────────────
  if (flow === 'saved' && savedReceipt) {
    return (
      <div>
        <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Receipt saved</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Snap another or edit this one</div>
        </div>
        <div style={{ padding: '20px 28px', maxWidth: 520 }}>

          {/* Success card */}
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              {savedReceipt.image_thumb && (
                <img src={savedReceipt.image_thumb} alt="Receipt" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2 2 4-4" stroke="#0e0f11" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{savedReceipt.merchant}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', background: 'var(--accent-bg)', color: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 3, padding: '1px 5px' }}>AI + OCR</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Paid', value: `$${savedReceipt.amount.toFixed(2)}` },
                    { label: 'Deduction', value: `$${savedReceipt.deduction_amount.toFixed(2)}`, accent: true },
                    { label: 'Tax back', value: `$${savedReceipt.tax_back_amount.toFixed(2)}`, accent: true },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{s.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)', color: s.accent ? 'var(--accent)' : 'var(--text-1)' }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
                  {CAT_META[savedReceipt.category]?.label} · {savedReceipt.date}
                  {savedReceipt.confidence != null && ` · OCR ${savedReceipt.confidence}%`}
                </div>
              </div>
            </div>
          </div>

          {/* ATO tip */}
          {savedReceipt.ato_tip && (
            <div style={{ background: 'var(--bg-2)', borderLeft: '3px solid var(--accent)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', padding: '10px 12px', marginBottom: 16 }}>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--accent-dim)', marginBottom: 3 }}>ATO note</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>{savedReceipt.ato_tip}</div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={handleEdit} style={{ padding: '9px', background: 'var(--bg-3)', color: 'var(--text-1)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-ui)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
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
  }

  // ── REVIEW/EDIT state ────────────────────────────────────────────────────
  if (flow === 'review') {
    return (
      <div>
        <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Edit receipt</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Correct any misread fields</div>
          </div>
          <button onClick={() => setFlow('saved')} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-ui)' }}>Cancel</button>
        </div>
        <div style={{ padding: '20px 28px', maxWidth: 520 }}>
          {savedReceipt?.image_data && (
            <img src={savedReceipt.image_data} alt="Receipt" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 16, background: 'var(--bg-3)' }} />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><label>Merchant</label><input type="text" value={merchant} onChange={e => setMerchant(e.target.value)} /></div>
            <div><label>Amount (AUD)</label><input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label>ATO category</label>
              <select value={category} onChange={e => setCategory(e.target.value as ATOCategory)} style={{ appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235a5d66'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28 }}>
                {CATS.map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
            </div>
            <div><label>Work use %</label><input type="number" min="0" max="100" value={workPct} onChange={e => setWorkPct(e.target.value)} /></div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label>Business purpose</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Brief ATO audit description" />
          </div>

          {amt > 0 && (
            <div style={{ background: 'var(--bg-2)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
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

          <button onClick={handleSaveEdits} style={{ width: '100%', padding: '9px', background: 'var(--accent)', color: '#0e0f11', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-ui)', cursor: 'pointer' }}>
            Save changes
          </button>
        </div>
      </div>
    )
  }

  // ── SCANNING state ───────────────────────────────────────────────────────
  if (flow === 'scanning') {
    return (
      <div>
        <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Reading receipt…</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>On-device OCR → Claude Haiku → auto-saved</div>
        </div>
        <div style={{ padding: '28px', maxWidth: 520 }}>
          {scan.imageData && (
            <img src={scan.imageData} alt="Scanning" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 20, background: 'var(--bg-3)', opacity: 0.7 }} />
          )}
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
            {STEPS.map((label, i) => {
              const id = i + 1
              const done = scan.stepDone.includes(id)
              const active = scan.step === id && !done
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0', borderBottom: i < STEPS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--accent)' : active ? 'var(--bg-4)' : 'var(--bg-3)', border: active ? '1.5px solid var(--accent-dim)' : 'none' }}>
                    {done
                      ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#0e0f11" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : active
                        ? <div style={{ width: 8, height: 8, border: '1.5px solid transparent', borderTopColor: 'var(--accent)', borderRadius: '50%' }} className="spin" />
                        : <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-3)' }} />
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: active ? 500 : 400, color: done ? 'var(--text-1)' : active ? 'var(--text-1)' : 'var(--text-3)' }}>{label}</div>
                    {id === 2 && active && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>On-device · free · private</div>}
                    {id === 3 && active && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>Claude Haiku · text-only · ~$0.001</div>}
                    {id === 2 && done && scan.ocrConfidence > 0 && <div style={{ fontSize: 10, color: 'var(--accent-dim)', marginTop: 1 }}>{scan.ocrConfidence}% confidence</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── IDLE / ERROR state ───────────────────────────────────────────────────
  return (
    <div>
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Snap a receipt</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Photo → OCR → auto-saved in one tap</div>
        </div>
        {!tesseractReady && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-3)' }}>
            <div style={{ width: 9, height: 9, border: '1.5px solid var(--bg-4)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} className="spin" />
            Loading OCR…
          </div>
        )}
      </div>

      <div style={{ padding: '20px 28px', maxWidth: 520 }}>

        {/* Error */}
        {flow === 'error' && error && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, background: 'var(--red-bg)', border: '1px solid rgba(255,107,107,0.2)', color: 'var(--red)', marginBottom: 16 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="7" cy="7" r="6" strokeWidth="1.3"/><path d="M7 4.5v3M7 9.5h.01" strokeWidth="1.4" strokeLinecap="round"/></svg>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 2 }}>{error}</div>
              <button onClick={reset} style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'var(--font-ui)' }}>Try again</button>
            </div>
          </div>
        )}

        {/* Primary CTA — camera */}
        <button
          onClick={() => cameraRef.current?.click()}
          style={{ width: '100%', padding: '20px', background: 'var(--accent)', color: '#0e0f11', border: 'none', borderRadius: 'var(--radius)', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-ui)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10, transition: 'opacity 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="18" height="14" rx="2"/><circle cx="11" cy="12" r="3.5"/><path d="M8 5l1-2h4l1 2"/>
          </svg>
          Snap receipt
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

        {/* Secondary — upload from files */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault() }}
          onDrop={onDrop}
          style={{ border: '1px dashed var(--border-2)', borderRadius: 'var(--radius)', padding: '16px', textAlign: 'center', cursor: 'pointer', background: 'var(--bg-2)', transition: 'border-color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-3)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
        >
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--text-3)" style={{ margin: '0 auto 6px', display: 'block' }}><path d="M8 11V3M5 6l3-3 3 3M2 12v1a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0014 13v-1" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>Upload from files</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>or drag & drop · JPG, PNG, WebP</div>
        </div>

        {/* How it works */}
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
          {[
            { step: '1', title: 'Snap', desc: 'Take or upload receipt photo' },
            { step: '2', title: 'OCR', desc: 'Tesseract reads text on-device' },
            { step: '3', title: 'Saved', desc: 'Claude classifies · auto-saved' },
          ].map((s, i, a) => (
            <div key={s.step} style={{ background: 'var(--bg-2)', padding: '12px', borderRadius: i === 0 ? 'var(--radius-sm) 0 0 var(--radius-sm)' : i === a.length - 1 ? '0 var(--radius-sm) var(--radius-sm) 0' : 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--accent-dim)', textTransform: 'uppercase', marginBottom: 4 }}>Step {s.step}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{s.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
