'use client'

import { useState, useEffect } from 'react'
import { Camera, Receipt, BarChart3, Settings } from 'lucide-react'
import SnapTab from '@/components/SnapTab'
import ReceiptsTab from '@/components/ReceiptsTab'
import DashboardTab from '@/components/DashboardTab'
import SettingsTab from '@/components/SettingsTab'
import { Receipt as ReceiptType, TaxProfile } from '@/types'
import { DEFAULT_TAX_PROFILE, getCurrentFY, getFYLabel, calcTaxBack } from '@/lib/tax'

type Tab = 'snap' | 'receipts' | 'dashboard' | 'settings'

export default function Home() {
  const [tab, setTab] = useState<Tab>('snap')
  const [receipts, setReceipts] = useState<ReceiptType[]>([])
  const [profile, setProfile] = useState<TaxProfile>(DEFAULT_TAX_PROFILE)
  const fy = getCurrentFY()

  // Load from localStorage (swap for Supabase in production)
  useEffect(() => {
    const saved = localStorage.getItem('snapclaim_receipts')
    if (saved) setReceipts(JSON.parse(saved))
    const savedProfile = localStorage.getItem('snapclaim_profile')
    if (savedProfile) setProfile(JSON.parse(savedProfile))
  }, [])

  const saveReceipts = (updated: ReceiptType[]) => {
    setReceipts(updated)
    localStorage.setItem('snapclaim_receipts', JSON.stringify(updated))
  }

  const saveProfile = (p: TaxProfile) => {
    setProfile(p)
    localStorage.setItem('snapclaim_profile', JSON.stringify(p))
  }

  const addReceipt = (r: ReceiptType) => {
    saveReceipts([r, ...receipts])
    setTab('receipts')
  }

  const deleteReceipt = (id: string) => {
    saveReceipts(receipts.filter(r => r.id !== id))
  }

  const totalTaxBack = receipts
    .filter(r => r.fy_year === fy)
    .reduce((s, r) => s + r.tax_back_amount, 0)

  const tabs: { id: Tab; label: string; Icon: React.ElementType }[] = [
    { id: 'snap', label: 'Snap', Icon: Camera },
    { id: 'receipts', label: 'Receipts', Icon: Receipt },
    { id: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ]

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-bold tracking-widest text-green-700 uppercase mb-1">
              Claude-powered · ATO-ready
            </p>
            <h1 className="text-2xl font-extrabold">
              SnapClaim <span className="text-green-700">AU</span>
            </h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 font-medium">{getFYLabel(fy)}</p>
            <p className="text-base font-bold font-mono text-green-700">
              ${Math.round(totalTaxBack).toLocaleString()} saved
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Panels */}
        <div>
          {tab === 'snap' && (
            <SnapTab profile={profile} onAdd={addReceipt} />
          )}
          {tab === 'receipts' && (
            <ReceiptsTab receipts={receipts.filter(r => r.fy_year === fy)} onDelete={deleteReceipt} />
          )}
          {tab === 'dashboard' && (
            <DashboardTab receipts={receipts.filter(r => r.fy_year === fy)} profile={profile} fy={fy} />
          )}
          {tab === 'settings' && (
            <SettingsTab profile={profile} onSave={saveProfile} />
          )}
        </div>
      </div>
    </div>
  )
}
