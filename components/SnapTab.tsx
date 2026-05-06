'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { ATOCategory, Receipt, TaxProfile, ScanResult } from '@/types'
import { CAT_META, calcDeduction, calcTaxBack, getCurrentFY } from '@/lib/tax'

declare global {
  interface Window {
    Tesseract: {
      createWorker: (lang: string, oem?: number, options?: Record<string, unknown>) => Promise<{
        recognize: (img: string) => Promise<{ data: { text: string; confidence: number } }>
        terminate: () => Promise<void>
      }>
    }
  }
}

const CATS = Object.entries(CAT_META) as [ATOCategory, typeof CAT_META[ATOCategory]][]

const STEPS = [
  { id: 1, label: 'Loading OCR engine' },
  { id: 2, label: 'Reading receipt text' },
  { id: 3, label: 'Matching ATO category' },
  { id: 4, label: 'Calculating deduction' },
]

export default function SnapTab({ profile, onAdd }: { profile: TaxProfile; onAdd: (r: Receipt) => void }) {
  const [tesseractReady, setTesseractReady] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [stepStatus, setStepStatus] = useState<Record<number, 'pending' | 'active' | 'done'>>({})
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<Partial<ScanResult> | null>(null)
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ATOCategory | ''>('')
  const [workPct, setWorkPct] = useState('100')
  const [notes, setNotes] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Preload Tesseract.js script on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.Tesseract) { setTesseractReady(true); return }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js'
    script.onload = () => setTesseractReady(true)
    script.onerror = () => console.warn('Tesseract.js failed to load — manual entry only')
    document.head.appendChild(script)
  }, [])

  const setStep = (id: number, status: 'active' | 'done') => {
    setCurrentStep(id)
    setStepStatus(prev => ({ ...prev, [id]: status }))
  }

  const markDone = (id: number) => setStepStatus(prev => ({ ...prev, [id]: 'done' }))

  const scanImage = async (dataUrl: string) => {
    setError(null)
    setScanning(true)
    setCurrentStep(0)
    setStepStatus({})

    let rawOcrText = ''
    let confidence = 0

    try {
      // ── Step 1: Load Tesseract worker ──────────────────────────────
      setStep(1, 'active')
      if (!window.Tesseract) throw new Error('OCR engine not loaded. Refresh and try again.')
      const worker = await window.Tesseract.createWorker('eng', 1, {
        logger: () => {}, // suppress verbose logs
      })
      markDone(1)

      // ── Step 2: Run OCR entirely in browser (free, on-device) ──────
      setStep(2, 'active')
      const result = await worker.recognize(dataUrl)
      rawOcrText = result.data.text.trim()
      confidence = Math.round(result.data.confidence)
      await worker.terminate()
      setOcrText(rawOcrText)
      setOcrConfidence(confidence)
      markDone(2)

      if (!rawOcrText || rawOcrText.length < 10) {
        throw new Error('Could not read text from image. Try a sharper, well-lit photo.')
      }

      // ── Step 3: Send OCR text to Claude for ATO classification ─────
      setStep(3, 'active')
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocrText: rawOcrText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Classification failed')
      const r: ScanResult = data.result
      markDone(3)

      // ── Step 4: Apply results ──────────────────────────────────────
      setStep(4, 'active')
      await new Promise(resolve => setTimeout(resolve, 300))
      setScanResult({ ...r, confidence: Math.min(confidence, r.confidence ?? confidence) })
      setMerchant(r.merchant || '')
      setAmount(r.amount?.toString() || '')
      setCategory(r.category || 'other')
      setWorkPct(r.work_pct?.toString() || '100')
      setNotes(r.notes || '')
      markDone(4)

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scan failed. Please enter details manually.')
    } finally {
      setScanning(false)
    }
  }

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload a JPG, PNG or WebP image.')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      const url = e.target?.result as string
      setPreview(url)
      scanImage(url)
    }
    reader.readAsDataURL(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const amt = parseFloat(amount) || 0
  const cat = (category || 'other') as ATOCategory
  const pct = parseFloat(workPct) || 100
  const deduction = amt > 0 ? calcDeduction(amt, cat, pct) : 0
  const taxBack = amt > 0 ? calcTaxBack(deduction, profile) : 0
  const meta = CAT_META[cat]

  const handleAdd = () => {
    if (!merchant.trim() || !amt) {
      setError('Merchant name and amount are required.')
      return
    }
    const receipt: Receipt = {
      id: crypto.randomUUID(),
      merchant: merchant.trim(),
      amount: amt,
      date: new Date().toISOString().split('T')[0],
      category: cat,
      work_pct: pct,
      notes: notes.trim(),
      deduction_amount: deduction,
      tax_back_amount: taxBack,
      ai_scanned: !!scanResult,
      ocr_raw: ocrText,
      ato_tip: scanResult?.ato_tip,
      confidence: scanResult?.confidence,
      fy_year: getCurrentFY(),
      created_at: new Date().toISOString(),
    }
    onAdd(receipt)
    // Reset
    setMerchant(''); setAmount(''); setCategory(''); setWorkPct('100')
    setNotes(''); setPreview(null); setScanResult(null)
    setOcrText(''); setOcrConfidence(null); setError(null)
    setStepStatus({}); setCurrentStep(0)
  }

  const s = (label: string) => ({
    display: 'block' as const,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'var(--t3)',
    marginBottom: 5,
  })

  return (
    <div>
      {/* Page header */}
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Add receipt</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            On-device OCR · free · no image ever leaves your browser
          </div>
        </div>
        {!tesseractReady && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-3)' }}>
            <div style={{ width: 10, height: 10, border: '1.5px solid var(--bg-4)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} className="spin" />
            Loading OCR engine…
          </div>
        )}
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
            borderRadius: 'var(--radius)',
            padding: '24px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s',
            marginBottom: 16,
            background: dragging ? 'var(--accent-bg)' : 'var(--bg-2)',
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ margin: '0 auto 8px', display: 'block', stroke: dragging ? 'var(--accent-dim)' : 'var(--text-3)' }}>
            <path d="M10 13V4M6 7l4-4 4 4M4 14v1a2 2 0 002 2h8a2 2 0 002-2v-1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', marginBottom: 2 }}>
            {tesseractReady ? 'Snap or upload receipt' : 'Upload receipt image'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
            Tesseract OCR runs entirely in your browser · free · private
          </div>
        </div>

        {/* How it works badge */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 14, padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          {[
            { icon: '📷', label: 'Tesseract OCR', desc: 'reads text on-device' },
            { icon: '→', label: '' , desc: '' },
            { icon: '🤖', label: 'Claude Haiku', desc: 'classifies ATO category' },
            { icon: '→', label: '', desc: '' },
            { icon: '🧾', label: 'Auto-filled', desc: 'deduction calculated' },
          ].filter(s => s.label || s.icon === '→').map((s, i) => (
            s.icon === '→'
              ? <div key={i} style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>→</div>
              : <div key={i} style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{s.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{s.desc}</div>
                </div>
          ))}
        </div>

        {/* Receipt preview */}
        {preview && !scanning && (
          <img
            src={preview}
            alt="Receipt"
            style={{ width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 14, background: 'var(--bg-3)' }}
          />
        )}

        {/* Scanning progress */}
        {scanning && (
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 13, height: 13, border: '1.5px solid var(--bg-4)', borderTopColor: 'var(--accent)', borderRadius: '50%', flexShrink: 0 }} className="spin" />
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>Processing receipt…</span>
            </div>
            {STEPS.map(({ id, label }) => {
              const status = stepStatus[id] || 'pending'
              return (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
                  fontSize: 12,
                  color: status === 'done' ? 'var(--accent)' : status === 'active' ? 'var(--text-1)' : 'var(--text-3)',
                  fontWeight: status === 'active' ? 500 : 400,
                }}>
                  <div style={{
                    width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                    background: status === 'done' ? 'var(--accent)' : status === 'active' ? 'var(--text-1)' : 'var(--text-3)',
                  }} />
                  {label}
                  {id === 2 && status === 'active' && (
                    <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 2 }}>(on-device, free)</span>
                  )}
                  {id === 3 && status === 'active' && (
                    <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 2 }}>(Claude Haiku)</span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', gap: 8, padding: '9px 11px', borderRadius: 'var(--radius-sm)', fontSize: 12, background: 'var(--red-bg)', border: '1px solid rgba(255,107,107,0.2)', color: 'var(--red)', marginBottom: 12 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="6.5" cy="6.5" r="5.5" strokeWidth="1.2" /><path d="M6.5 4v3M6.5 9h.01" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}

        {/* OCR raw output */}
        {ocrText && !scanning && (
          <details style={{ marginBottom: 12 }}>
            <summary style={{ fontSize: 11, color: 'var(--text-3)', cursor: 'pointer', userSelect: 'none', marginBottom: 4 }}>
              Raw OCR output {ocrConfidence !== null && `· ${ocrConfidence}% confidence`}
            </summary>
            <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', maxHeight: 80, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {ocrText}
            </div>
          </details>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '14px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          review & confirm
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Form fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={s('')}>Merchant</label>
            <input type="text" placeholder="e.g. Officeworks" value={merchant} onChange={e => setMerchant(e.target.value)} />
          </div>
          <div>
            <label style={s('')}>Amount (AUD)</label>
            <input type="number" placeholder="0.00" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={s('')}>ATO category</label>
            <select value={category} onChange={e => setCategory(e.target.value as ATOCategory)} style={{ appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235a5d66'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28 }}>
              <option value="">— select —</option>
              {CATS.map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label style={s('')}>Work use %</label>
            <input type="number" min="0" max="100" value={workPct} onChange={e => setWorkPct(e.target.value)} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={s('')}>Business purpose</label>
          <input type="text" placeholder="Brief ATO audit description" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {/* Deduction result card */}
        {amt > 0 && (
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-dim)', marginBottom: 4 }}>Estimated deduction</div>
                <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em', lineHeight: 1 }}>${deduction.toFixed(2)}</div>
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
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'var(--accent-bg)', color: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 3, padding: '1px 5px' }}>
                  Tesseract + Claude
                </span>
              )}
            </div>
            {scanResult?.confidence != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', width: 70 }}>OCR quality</span>
                <div style={{ flex: 1, height: 2, background: 'var(--bg-4)', borderRadius: 1, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${scanResult.confidence}%`, background: scanResult.confidence > 70 ? 'var(--accent)' : scanResult.confidence > 40 ? 'var(--amber)' : 'var(--red)', transition: 'width 0.5s ease' }} />
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

        <button
          onClick={handleAdd}
          style={{ width: '100%', padding: '9px 16px', background: 'var(--accent)', color: '#0e0f11', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-ui)', cursor: 'pointer', transition: 'opacity 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 2v9M2 6.5h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Add to tax log
        </button>
      </div>
    </div>
  )
}
