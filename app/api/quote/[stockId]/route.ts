import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  const { stockId } = await params;
  const authHeader = request.headers.get("authorization");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined
  );

  const { data, error } = await supabase
    .from("price_quotes")
    .select("stock_id, price, prev_close, change_rate, fetched_at")
    .eq("stock_id", stockId)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "QUOTE_NOT_FOUND" }, { status: 404 });
  }

  return Response.json(data);
}
