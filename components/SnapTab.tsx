'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, Plus, AlertCircle, Info, Sparkles } from 'lucide-react'
import { ATOCategory, Receipt, TaxProfile, ScanResult } from '@/types'
import { CAT_META, calcDeduction, calcTaxBack, getCurrentFY } from '@/lib/tax'


const CATEGORIES = Object.entries(CAT_META) as [ATOCategory, typeof CAT_META[ATOCategory]][]

interface Props {
  profile: TaxProfile
  onAdd: (r: Receipt) => void
}

export default function SnapTab({ profile, onAdd }: Props) {
  const [dragging, setDragging] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanStep, setScanStep] = useState(0)
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
  const stepLabels = ['Decoding image', 'Extracting receipt data', 'Matching ATO category', 'Calculating deduction']

  const animateSteps = async () => {
    for (let i = 0; i < 4; i++) {
      setScanStep(i + 1)
      await new Promise(r => setTimeout(r, 850))
    }
  }

  const scanImage = async (base64: string, mimeType: string) => {
    setError(null)
    setScanning(true)
    setScanStep(0)
    const anim = animateSteps()
    try {
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      })
      await anim
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Scan failed'); return }
      const r: ScanResult = data.result
      setScanResult(r)
      setMerchant(r.merchant || '')
      setAmount(r.amount?.toString() || '')
      setCategory(r.category || 'other')
      setWorkPct(r.work_pct?.toString() || '100')
      setNotes(r.notes || '')
      setOcrText(r.ocr_text || '')
    } catch (e: unknown) {
      await anim
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setScanning(false)
      setScanStep(0)
    }
  }

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload a JPG, PNG, or WebP image.')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      setPreview(dataUrl)
      const base64 = dataUrl.split(',')[1]
      scanImage(base64, file.type)
    }
    reader.readAsDataURL(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  const amt = parseFloat(amount) || 0
  const cat = category || 'other'
  const pct = parseFloat(workPct) || 100
  const deduction = amt > 0 ? calcDeduction(amt, cat, pct) : 0
  const taxBack = calcTaxBack(deduction, profile)
  const meta = CAT_META[cat]

  const handleAdd = () => {
    if (!merchant || !amt) { setError('Please enter a merchant name and amount.'); return }
    const receipt: Receipt = {
      id: crypto.randomUUID(),
      merchant,
      amount: amt,
      date: new Date().toISOString().split('T')[0],
      category: cat,
      work_pct: pct,
      notes,
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
    setMerchant(''); setAmount(''); setCategory(''); setWorkPct('100'); setNotes('')
    setPreview(null); setScanResult(null); setOcrText('')
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          dragging ? 'border-green-600 bg-green-50' : 'border-green-400 bg-green-50 hover:bg-green-100'
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <Upload className="mx-auto mb-3 text-green-600" size={28} />
        <p className="font-bold text-green-700">Snap or upload a receipt</p>
        <p className="text-xs text-gray-500 mt-1">Claude reads it instantly — JPG, PNG, WebP</p>
      </div>

      {/* Image preview */}
      {preview && !scanning && (
        <img src={preview} alt="Receipt preview" className="w-full max-h-48 object-contain rounded-lg border border-gray-200" />
      )}

      {/* Processing overlay */}
      {scanning && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-5 text-center">
          <div className="w-7 h-7 border-2 border-green-200 border-t-green-600 rounded-full spinner mx-auto mb-3" />
          <p className="text-sm font-semibold text-green-700 mb-2">Claude is reading your receipt…</p>
          <div className="space-y-1">
            {stepLabels.map((label, i) => (
              <p key={i} className={`text-xs transition-all ${
                i + 1 < scanStep ? 'text-green-600 font-medium' :
                i + 1 === scanStep ? 'text-gray-900 font-semibold' :
                'text-gray-400'
              }`}>
                {i + 1 < scanStep ? '✓ ' : i + 1 === scanStep ? '→ ' : '  '}{label}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex gap-2 items-start bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <p className="text-center text-xs text-gray-400">— or enter manually —</p>

      {/* Form */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Merchant</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Officeworks" value={merchant} onChange={e => setMerchant(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Amount ($)</label>
          <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="0.00" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">ATO category</label>
          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={category} onChange={e => setCategory(e.target.value as ATOCategory)}>
            <option value="">— select —</option>
            {CATEGORIES.map(([key, m]) => <option key={key} value={key}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Work use %</label>
          <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" min="0" max="100" value={workPct} onChange={e => setWorkPct(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Business purpose</label>
        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Brief description for ATO audit trail" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      {/* OCR text */}
      {ocrText && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs font-mono text-gray-500 max-h-20 overflow-y-auto whitespace-pre-wrap">
          {ocrText}
        </div>
      )}

      {/* Deduction result card */}
      {amt > 0 && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-green-700 uppercase tracking-wider">Estimated deduction</p>
              <p className="text-3xl font-extrabold text-green-700 font-mono leading-tight">${deduction.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {Math.round(meta.deductible_pct * 100)}% deductible · {pct}% work use
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Tax back</p>
              <p className="text-xl font-extrabold text-green-700 font-mono">${taxBack.toFixed(2)}</p>
              <p className="text-xs text-gray-400">@ {Math.round(profile.marginal_rate * 100)}%</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 bg-white rounded-full px-3 py-1.5 w-fit border border-green-200">
            <span className="text-xs font-semibold text-green-700">{meta.label}</span>
            {scanResult && <span className="flex items-center gap-1 text-xs text-green-600 font-bold"><Sparkles size={10} /> AI</span>}
          </div>
          {scanResult?.confidence != null && (
            <div className="mt-3 pt-3 border-t border-green-200">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-20">AI confidence</span>
                <div className="flex-1 bg-green-200 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-green-600 rounded-full conf-bar-fill" style={{ width: `${scanResult.confidence}%` }} />
                </div>
                <span className="text-xs font-mono text-green-700 w-8 text-right">{scanResult.confidence}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ATO hint */}
      {category && CAT_META[category as ATOCategory] && (
        <div className="flex gap-2 items-start bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <span>{scanResult?.ato_tip || CAT_META[category as ATOCategory].ato_hint}</span>
        </div>
      )}

      <button onClick={handleAdd} className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
        <Plus size={16} /> Add to tax log
      </button>
    </div>
  )
}
