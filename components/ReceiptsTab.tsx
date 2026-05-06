'use client'

import { useState } from 'react'
import { Trash2, Sparkles } from 'lucide-react'
import { Receipt, ATOCategory } from '@/types'
import { CAT_META } from '@/lib/tax'

interface Props {
  receipts: Receipt[]
  onDelete: (id: string) => void
}

export default function ReceiptsTab({ receipts, onDelete }: Props) {
  const [filter, setFilter] = useState<ATOCategory | ''>('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const filtered = filter ? receipts.filter(r => r.category === filter) : receipts
  const totalDeductions = filtered.reduce((s, r) => s + r.deduction_amount, 0)

  const handleDelete = (id: string) => {
    if (confirmDelete === id) {
      onDelete(id)
      setConfirmDelete(null)
    } else {
      setConfirmDelete(id)
      setTimeout(() => setConfirmDelete(null), 3000)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">FY 2024–25</p>
          <p className="text-base font-bold">{receipts.length} receipts · <span className="text-green-700">${Math.round(totalDeductions).toLocaleString()} claimed</span></p>
        </div>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as ATOCategory | '')}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
        >
          <option value="">All categories</option>
          {Object.entries(CAT_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🧾</p>
          <p className="text-sm">No receipts yet. Snap your first one!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const meta = CAT_META[r.category] || CAT_META.other
            return (
              <div key={r.id} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-colors">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
                  style={{ backgroundColor: meta.color + '18' }}
                >
                  <span style={{ color: meta.color }}>$</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold truncate">{r.merchant}</p>
                    {r.ai_scanned && (
                      <span className="flex items-center gap-0.5 text-xs bg-green-50 text-green-700 rounded-full px-1.5 py-0.5 font-bold flex-shrink-0">
                        <Sparkles size={9} /> AI
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{r.date} · {meta.label}{r.notes ? ` · ${r.notes}` : ''}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold font-mono text-green-700">-${r.deduction_amount.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">${r.amount.toFixed(2)} total</p>
                </div>
                <button
                  onClick={() => handleDelete(r.id)}
                  className={`ml-1 p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                    confirmDelete === r.id
                      ? 'bg-red-100 text-red-600'
                      : 'text-gray-300 hover:text-red-400 hover:bg-red-50'
                  }`}
                  title={confirmDelete === r.id ? 'Click again to confirm' : 'Delete'}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
