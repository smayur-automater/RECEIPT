import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enrichReceipt } from '@/lib/tax'
import { TaxProfile } from '@/types'

function getSupabase(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader || '' } } }
  )
}

// GET /api/receipts?fy=2024-2025
export async function GET(req: NextRequest) {
  const supabase = getSupabase(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const fy = req.nextUrl.searchParams.get('fy')
  const category = req.nextUrl.searchParams.get('category')

  let query = supabase
    .from('receipts')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false })

  if (fy) query = query.eq('fy_year', fy)
  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ receipts: data })
}

// POST /api/receipts
export async function POST(req: NextRequest) {
  const supabase = getSupabase(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Get tax profile for calculations
  const { data: profileData } = await supabase
    .from('tax_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const profile: TaxProfile = profileData || { marginal_rate: 0.325, business_type: 'individual' }

  const enriched = enrichReceipt({ ...body, user_id: user.id }, profile)

  const { data, error } = await supabase
    .from('receipts')
    .insert(enriched)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Write audit log
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'receipt_created',
    receipt_id: data.id,
    snapshot: data,
  })

  return NextResponse.json({ receipt: data }, { status: 201 })
}

// DELETE /api/receipts?id=xxx
export async function DELETE(req: NextRequest) {
  const supabase = getSupabase(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Soft-delete: write audit log before delete
  const { data: receipt } = await supabase.from('receipts').select('*').eq('id', id).single()
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'receipt_deleted',
    receipt_id: id,
    snapshot: receipt,
  })

  const { error } = await supabase.from('receipts').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
