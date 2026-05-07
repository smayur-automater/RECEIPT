import { NextResponse } from 'next/server'

// TEMPORARY diagnostic — DELETE after confirming key works
export async function GET() {
  const key = process.env.GOOGLE_VISION_API_KEY
  return NextResponse.json({
    key_set: !!key,
    key_length: key?.length ?? 0,
    key_prefix: key ? key.slice(0, 8) + '...' : null,
    key_starts_correctly: key?.startsWith('AIzaSy') ?? false,
    key_has_whitespace: key ? key !== key.trim() : false,
    node_env: process.env.NODE_ENV,
  })
}
