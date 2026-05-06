import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      receipts: {
        Row: {
          id: string
          user_id: string
          merchant: string
          amount: number
          date: string
          category: string
          work_pct: number
          notes: string
          deduction_amount: number
          tax_back_amount: number
          ai_scanned: boolean
          ocr_raw: string | null
          ato_tip: string | null
          confidence: number | null
          fy_year: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['receipts']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['receipts']['Insert']>
      }
      tax_profiles: {
        Row: {
          id: string
          user_id: string
          marginal_rate: number
          business_type: string
          name: string | null
          abn: string | null
          updated_at: string
        }
      }
    }
  }
}
