import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { ScanResult } from '@/types'

// This endpoint receives raw OCR text (extracted client-side by Tesseract.js)
// and uses Claude text-only to classify + structure the ATO deduction data.
// No image is ever sent to Claude — dramatically cheaper and faster.

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
  "ocr_text": "${ocrText.slice(0, 300).replace(/"/g, "'")}"
}

Rules:
- amount: the final TOTAL paid including GST. Look for "TOTAL", "AMOUNT DUE", "GRAND TOTAL". Return as a number.
- date: parse any date format into YYYY-MM-DD. If missing use today.
- category: pick the single best-fitting ATO work-related expense category.
- work_pct: realistic business-use % for this type (phone=50, dedicated work tools=100, fuel=80, internet=60).
- ato_deductible_pct: per ATO rules — tools_equipment=100, phone_internet=50, vehicle=90, clothing=85, education=75, home_office=67, professional_services=90, meals_entertainment=50, other=80.
- confidence: 0-100 reflecting how clearly the OCR text was readable and parsed.
- ato_tip: cite a specific ATO rule or threshold relevant to this exact expense type.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { ocrText } = body

    if (!ocrText || typeof ocrText !== 'string' || ocrText.trim().length < 5) {
      return NextResponse.json(
        { error: 'No readable text found in image. Try a clearer photo or enter details manually.' },
        { status: 400 }
      )
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', // Fast + cheap for structured extraction
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
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
