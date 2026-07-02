import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '❌ ไม่พบ Supabase environment variables\n' +
    'กรุณาสร้างไฟล์ .env และใส่:\n' +
    'VITE_SUPABASE_URL=https://xxxx.supabase.co\n' +
    'VITE_SUPABASE_ANON_KEY=your-anon-key'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
