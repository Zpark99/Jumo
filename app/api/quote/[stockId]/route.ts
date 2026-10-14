import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import { QUOTE_CACHE_TTL_MS } from "@/lib/constants";
import { getKisToken } from "@/lib/kis";
import { fetchAndStoreQuote } from "@/lib/quotes";

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

  if (data) {
    const ageMs = Date.now() - new Date(data.fetched_at).getTime();
    if (ageMs < QUOTE_CACHE_TTL_MS) {
      return Response.json(data);
    }
    // 캐시 만료 → KIS 재호출하여 price_quotes 갱신 (V3_STALE_QUOTE 방지)
  }

  // 캐시 미스 시 KIS API 직접 호출 → price_quotes 저장 (lib/quotes, #165)
  try {
    const token = await getKisToken();
    const { quote, saveError } = await fetchAndStoreQuote(stockId, token);

    if (!quote) {
      return Response.json({ error: "QUOTE_NOT_FOUND" }, { status: 404 });
    }
    if (saveError) {
      console.error("[quote] price_quotes upsert 실패:", saveError);
    }

    return Response.json(quote);
  } catch {
    return Response.json({ error: "QUOTE_NOT_FOUND" }, { status: 404 });
  }
}
