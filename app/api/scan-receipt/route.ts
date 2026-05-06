import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { ScanResult } from '@/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are an expert Australian tax accountant specialising in ATO deductions for individuals, sole traders, and small businesses.

When given a receipt image, extract all relevant details and classify the expense according to ATO work-related expense categories.

Always respond with ONLY a valid JSON object — no markdown, no code fences, no extra text.`

const USER_PROMPT = `Analyse this receipt and extract all details for an Australian tax deduction claim.

Respond ONLY with a JSON object in this exact format:
{
  "merchant": "exact store/vendor name from receipt",
  "amount": 123.45,
  "date": "YYYY-MM-DD",
  "category": "one of: work_from_home|vehicle|tools_equipment|clothing|education|phone_internet|meals_entertainment|professional_services|home_office|other",
  "work_pct": 0-100,
  "notes": "concise business purpose description",
  "ato_deductible_pct": 0-100,
  "confidence": 0-100,
  "ato_tip": "one specific, actionable ATO compliance tip for this expense type",
  "ocr_text": "key text lines extracted from the receipt"
}

Rules:
- amount: extract the TOTAL amount paid (include GST)
- date: if unclear, use today's date
- category: choose the most appropriate ATO work-related expense category
- work_pct: realistic business-use percentage (e.g. phone=50, dedicated work tool=100, fuel=80)
- ato_deductible_pct: per ATO rules (tools_equipment=100, phone_internet=50, vehicle=90, etc.)
- confidence: how confident you are in the extraction (0-100)
- ato_tip: specific to this receipt type, referencing current ATO rules`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { imageBase64, mimeType } = body

    if (!imageBase64 || !mimeType) {
      return NextResponse.json({ error: 'Missing imageBase64 or mimeType' }, { status: 400 })
    }

    const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!validMimeTypes.includes(mimeType)) {
      return NextResponse.json({ error: 'Unsupported image type. Use JPEG, PNG, GIF, or WebP.' }, { status: 400 })
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: imageBase64,
              },
            },
            { type: 'text', text: USER_PROMPT },
          ],
        },
      ],
    })

    const rawText = message.content.find(b => b.type === 'text')?.text || ''

    let parsed: ScanResult
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim())
    } catch {
      return NextResponse.json(
        { error: 'Could not parse Claude response. Please try again or enter details manually.' },
        { status: 422 }
      )
    }

    // Validate required fields
    if (!parsed.merchant || !parsed.amount || !parsed.category) {
      return NextResponse.json(
        { error: 'Receipt could not be read clearly. Please enter details manually.' },
        { status: 422 }
      )
    }

    return NextResponse.json({ result: parsed })
  } catch (error: unknown) {
    console.error('Scan receipt error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
