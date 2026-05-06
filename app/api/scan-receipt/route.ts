import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { ScanResult } from '@/types'

const SYSTEM_PROMPT = `You are an expert Australian tax accountant specialising in ATO work-related expense deductions for individuals, sole traders, and small businesses.

You will receive raw OCR text extracted from a receipt. Parse it and return structured tax deduction data.

Always respond with ONLY a valid JSON object. No markdown fences, no preamble, no explanation.`

const buildPrompt = (ocrText: string) => `Raw OCR text from a receipt:

<ocr_text>
${ocrText}
</ocr_text>

Extract all details and return ONLY this JSON object:
{
  "merchant": "store or vendor name",
  "amount": 123.45,
  "date": "YYYY-MM-DD",
  "category": "work_from_home|vehicle|tools_equipment|clothing|education|phone_internet|meals_entertainment|professional_services|home_office|other",
  "work_pct": 0-100,
  "notes": "concise business purpose (one sentence)",
  "ato_deductible_pct": 0-100,
  "confidence": 0-100,
  "ato_tip": "one specific actionable ATO compliance tip for this expense type",
  "ocr_text": "first 200 chars of the raw text"
}

Rules:
- amount: the final TOTAL paid including GST. Look for TOTAL, AMOUNT DUE, GRAND TOTAL. Return as a number.
- date: parse any date format into YYYY-MM-DD. If missing use today.
- category: pick the single best-fitting ATO work-related expense category.
- work_pct: realistic business-use % (phone=50, dedicated work tools=100, fuel=80, internet=60).
- ato_deductible_pct: per ATO rules — tools_equipment=100, phone_internet=50, vehicle=90, clothing=85, education=75, home_office=67, professional_services=90, meals_entertainment=50, other=80.
- confidence: 0-100 reflecting OCR clarity.
- ato_tip: cite a specific ATO rule relevant to this expense.`

export async function POST(req: NextRequest) {
  try {
    // Read API key per-request so Vercel env vars are always fresh
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not set. Add it to your Vercel environment variables or .env.local file.' },
        { status: 500 }
      )
    }

    const body = await req.json()
    const { ocrText } = body

    if (!ocrText || typeof ocrText !== 'string' || ocrText.trim().length < 5) {
      return NextResponse.json(
        { error: 'No readable text found in image. Try a clearer photo or enter details manually.' },
        { status: 400 }
      )
    }

    // Instantiate client inside handler — never at module level on serverless
    const client = new Anthropic({ apiKey })

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(ocrText.slice(0, 2000)) }],
    })

    const rawText = message.content.find(b => b.type === 'text')?.text || ''

    let parsed: ScanResult
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim())
    } catch {
      return NextResponse.json(
        { error: 'Could not structure receipt data. Please enter details manually.' },
        { status: 422 }
      )
    }

    if (!parsed.merchant || !parsed.amount || !parsed.category) {
      return NextResponse.json(
        { error: 'Receipt text was unclear. Please check the fields and adjust.' },
        { status: 422 }
      )
    }

    return NextResponse.json({ result: parsed })
  } catch (error: unknown) {
    console.error('Classify receipt error:', error)

    // Surface Anthropic API errors clearly
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('authentication')) {
        return NextResponse.json(
          { error: 'Invalid Anthropic API key. Check ANTHROPIC_API_KEY in your Vercel environment variables.' },
          { status: 401 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ error: 'Unknown error' }, { status: 500 })
  }
}
