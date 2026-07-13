import { createClient } from "@supabase/supabase-js";

// service_role 키 전용 서버 클라이언트. RLS를 완전히 우회하므로
// API 라우트(서버) 밖에서는 절대 import하지 말 것 (클라이언트 번들 노출 금지).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
