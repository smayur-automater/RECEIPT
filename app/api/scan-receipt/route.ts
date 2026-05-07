import { NextRequest, NextResponse } from 'next/server'
import { ScanResult, ATOCategory } from '@/types'

// ── Google Cloud Vision OCR (free tier: 1,000 req/month) ─────────────────
async function googleVisionOCR(base64Image: string): Promise<{ text: string; confidence: number }> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY
  if (!apiKey) throw new Error('GOOGLE_VISION_API_KEY is not set in environment variables.')

  const body = {
    requests: [{
      image: { content: base64Image },
      features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
    }],
  }

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || res.statusText
    if (res.status === 403) throw new Error('Google Vision API key is invalid or Cloud Vision API is not enabled.')
    throw new Error(`Google Vision error: ${msg}`)
  }

  const data = await res.json()
  const annotation = data.responses?.[0]?.fullTextAnnotation
  const text = annotation?.text?.trim() || ''
  // Google Vision doesn't return a confidence directly — estimate from detection presence
  const confidence = text.length > 20 ? 88 : text.length > 5 ? 60 : 0
  return { text, confidence }
}

// ── Rule-based ATO classifier ─────────────────────────────────────────────
// No AI API needed — keyword matching covers 90%+ of common receipts

const CATEGORY_RULES: { category: ATOCategory; keywords: string[]; workPct: number; deductPct: number }[] = [
  {
    category: 'phone_internet',
    keywords: ['telstra','optus','vodafone','tpg','aussie broadband','superloop','belong','amaysim','boost mobile','internet','broadband','mobile plan','data plan','sim','phone bill'],
    workPct: 50, deductPct: 50,
  },
  {
    category: 'vehicle',
    keywords: ['fuel','petrol','diesel','bp','shell','caltex','ampol','7-eleven','united petroleum','metro petroleum','coles express','woolworths petrol','car wash','parking','toll','uber','taxi','rideshare','lyft','ola','didi'],
    workPct: 80, deductPct: 90,
  },
  {
    category: 'tools_equipment',
    keywords: ['officeworks','jb hi-fi','harvey norman','bunnings','total tools','sydney tools','tech','computer','laptop','monitor','keyboard','mouse','printer','scanner','software','adobe','microsoft','apple store','dell','lenovo','hp','hardware','usb','hard drive','ssd','headphones','webcam','microphone'],
    workPct: 100, deductPct: 100,
  },
  {
    category: 'education',
    keywords: ['udemy','coursera','linkedin learning','skillshare','pluralsight','masterclass','book','textbook','course','training','workshop','seminar','conference','tafe','university','study','education','tutorial','subscription learning'],
    workPct: 100, deductPct: 75,
  },
  {
    category: 'meals_entertainment',
    keywords: ['restaurant','cafe','coffee','mcdonald','kfc','subway','hungry jack','domino','pizza','sushi','thai','chinese','indian','bistro','bar','pub','hotel dining','catering','uber eats','doordash','menulog','deliveroo'],
    workPct: 50, deductPct: 50,
  },
  {
    category: 'professional_services',
    keywords: ['accountant','accounting','legal','lawyer','solicitor','consultant','advisory','bookkeeper','xero','myob','quickbooks','hr block','tax agent','financial adviser','insurance','professional indemnity','public liability'],
    workPct: 100, deductPct: 90,
  },
  {
    category: 'home_office',
    keywords: ['ikea','officeworks furniture','desk','chair','lamp','monitor stand','shelf','storage','stationery','paper','ink','toner','pens','notebook','whiteboard','filing'],
    workPct: 67, deductPct: 67,
  },
  {
    category: 'clothing',
    keywords: ['uniform','workwear','safety','hi-vis','hard hat','boots','steel cap','protective','gloves','apron','scrubs','kmart uniform','target workwear'],
    workPct: 100, deductPct: 85,
  },
  {
    category: 'work_from_home',
    keywords: ['electricity','gas','energy','origin energy','agl','simply energy','red energy','water','council rates','rent','home office','utilities'],
    workPct: 67, deductPct: 80,
  },
]

const ATO_HINTS: Record<ATOCategory, string> = {
  phone_internet: 'Keep a 4-week usage diary to establish work-use %. Typical range: 25–80% for remote workers.',
  vehicle: 'Log every work trip. Cents-per-km method: up to 5,000km/yr at 88c/km (FY25).',
  tools_equipment: 'Items under $300 — claim immediately. Over $300 — must depreciate over effective life.',
  education: 'Must relate directly to your current job role, not a future career change.',
  meals_entertainment: 'Generally not deductible unless travelling overnight for work.',
  professional_services: 'Accountant fees and work-related legal costs are 100% deductible.',
  home_office: 'Fixed rate method: 67c/hr. Keep a timesheet. No receipts needed for this method.',
  clothing: 'Only deductible if distinctive uniform, protective, or occupation-specific attire.',
  work_from_home: 'Use the ATO 67c/hr fixed rate or actual expenses. Keep a 4-week representative diary.',
  other: 'Keep all receipts for 5 years. ATO most commonly audits claims over $300.',
}

function classifyReceipt(text: string): {
  category: ATOCategory; workPct: number; deductPct: number; confidence: number
} {
  const lower = text.toLowerCase()
  let bestMatch = { category: 'other' as ATOCategory, workPct: 80, deductPct: 80, score: 0 }

  for (const rule of CATEGORY_RULES) {
    const hits = rule.keywords.filter(kw => lower.includes(kw))
    if (hits.length > bestMatch.score) {
      bestMatch = { category: rule.category, workPct: rule.workPct, deductPct: rule.deductPct, score: hits.length }
    }
  }

  return { ...bestMatch, confidence: bestMatch.score > 0 ? Math.min(95, 70 + bestMatch.score * 8) : 55 }
}

// ── Extract merchant, amount, date from OCR text ──────────────────────────
function parseReceiptFields(text: string): { merchant: string; amount: number; date: string; notes: string } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Merchant: first non-empty line, cleaned
  const merchant = lines[0]
    ?.replace(/[^a-zA-Z0-9\s&'.-]/g, '')
    ?.trim()
    ?.slice(0, 40) || 'Unknown'

  // Amount: find the largest dollar amount (usually the total)
  const amountMatches = text.match(/\$?\s*(\d{1,4}[.,]\d{2})/g) || []
  const amounts = amountMatches
    .map(m => parseFloat(m.replace(/[$,\s]/g, '')))
    .filter(n => n > 0 && n < 50000)
  const amount = amounts.length > 0 ? Math.max(...amounts) : 0

  // Date: look for common date formats
  const datePatterns = [
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/,  // DD/MM/YY or DD-MM-YYYY
    /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/,     // YYYY-MM-DD
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,]+(\d{1,2})[\s,]+(\d{4})/i,
  ]
  let date = new Date().toISOString().split('T')[0]
  for (const pattern of datePatterns) {
    const m = text.match(pattern)
    if (m) {
      try {
        const parsed = new Date(m[0])
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
          date = parsed.toISOString().split('T')[0]
          break
        }
      } catch {}
    }
  }

  // Notes: look for GST or description lines
  const notesLine = lines.find(l =>
    l.match(/gst|tax invoice|receipt|purchase|sale/i) && l.length < 60
  ) || ''
  const notes = notesLine.replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 60)

  return { merchant, amount, date, notes }
}

// ── Main handler ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { imageBase64, mimeType } = body

    if (!imageBase64) {
      return NextResponse.json({ error: 'Missing imageBase64' }, { status: 400 })
    }

    // Run Google Vision OCR
    const { text: ocrText, confidence: ocrConf } = await googleVisionOCR(imageBase64)

    if (!ocrText || ocrText.length < 5) {
      return NextResponse.json(
        { error: 'No text found in image. Try a clearer, well-lit photo.' },
        { status: 422 }
      )
    }

    // Parse fields + classify category — all local, no AI API
    const { merchant, amount, date, notes } = parseReceiptFields(ocrText)
    const { category, workPct, deductPct, confidence } = classifyReceipt(ocrText)

    const result: ScanResult = {
      merchant,
      amount,
      date,
      category,
      work_pct: workPct,
      notes,
      ato_deductible_pct: deductPct,
      confidence: Math.round((ocrConf + confidence) / 2),
      ato_tip: ATO_HINTS[category],
      ocr_text: ocrText.slice(0, 400),
    }

    return NextResponse.json({ result })

  } catch (error: unknown) {
    console.error('Scan receipt error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'

    if (msg.includes('GOOGLE_VISION_API_KEY')) {
      return NextResponse.json({ error: msg }, { status: 500 })
    }
    if (msg.includes('invalid') || msg.includes('403')) {
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
