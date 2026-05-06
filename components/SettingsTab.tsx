'use client'

import { useState } from 'react'
import { Check, Shield } from 'lucide-react'
import { TaxProfile } from '@/types'
import { TAX_RATES } from '@/lib/tax'

interface Props {
  profile: TaxProfile
  onSave: (p: TaxProfile) => void
}

export default function SettingsTab({ profile, onSave }: Props) {
  const [rate, setRate] = useState(profile.marginal_rate.toString())
  const [bizType, setBizType] = useState(profile.business_type)
  const [name, setName] = useState(profile.name || '')
  const [abn, setAbn] = useState(profile.abn || '')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    onSave({ marginal_rate: parseFloat(rate), business_type: bizType as TaxProfile['business_type'], name, abn })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-4">
      {/* Tax profile */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
        <p className="text-sm font-bold">Tax profile</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Marginal rate</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={rate} onChange={e => setRate(e.target.value)}>
              {TAX_RATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Business type</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={bizType} onChange={e => setBizType(e.target.value as TaxProfile['business_type'])}>
              <option value="individual">Individual / Sole trader</option>
              <option value="company">Company (30%)</option>
              <option value="small_biz">Small business (25%)</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Full name</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">ABN (optional)</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="12 345 678 901" value={abn} onChange={e => setAbn(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Supabase connection */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
        <p className="text-sm font-bold">Database (Supabase)</p>
        <p className="text-xs text-gray-500">Set these in your <code className="bg-gray-100 px-1 rounded">.env.local</code> file to enable persistent storage and sync across devices.</p>
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">NEXT_PUBLIC_SUPABASE_URL</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono bg-gray-50" readOnly value="https://your-project.supabase.co" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono bg-gray-50" readOnly value="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." />
          </div>
        </div>
      </div>

      {/* Privacy */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-xs font-bold text-amber-800 mb-1.5 flex items-center gap-1.5">
          <Shield size={13} /> Data & privacy
        </p>
        <p className="text-xs text-amber-700">
          In this demo, data is stored in your browser's localStorage only. In production with Supabase enabled, all data is encrypted at rest and protected by row-level security — only you can see your receipts.
        </p>
        <p className="text-xs text-amber-700 mt-1.5">
          Receipt images are sent directly to Anthropic's API for OCR processing and are not stored on any server.
        </p>
      </div>

      <button onClick={handleSave} className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-colors ${saved ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-green-700 text-white hover:bg-green-800'}`}>
        {saved ? <><Check size={15} /> Saved!</> : 'Save settings'}
      </button>
    </div>
  )
}
