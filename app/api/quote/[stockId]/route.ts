import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getKisToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  const baseUrl = process.env.KIS_BASE_URL ?? "https://openapi.koreainvestment.com:9443";
  const res = await fetch(
    `${baseUrl}/oauth2/tokenP`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: process.env.KIS_APP_KEY,
        appsecret: process.env.KIS_APP_SECRET,
      }),
    }
  );
  const json = await res.json();
  if (!json.access_token) throw new Error("KIS token error: " + JSON.stringify(json));
  // expires_in은 초 단위, 30초 일찍 갱신
  const ttlMs = (json.expires_in ?? 86400) * 1000 - 30_000;
  cachedToken = { value: json.access_token as string, expiresAt: Date.now() + ttlMs };
  return cachedToken.value;
}

async function fetchKisQuote(code: string, token: string) {
  const baseUrl = process.env.KIS_BASE_URL ?? "https://openapi.koreainvestment.com:9443";
  const url = new URL(
    `${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price`
  );
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);

  const res = await fetch(url.toString(), {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: process.env.KIS_APP_KEY!,
      appsecret: process.env.KIS_APP_SECRET!,
      tr_id: "FHKST01010100",
    },
  });
  return res.json();
}

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
    if (ageMs < 50_000) {
      return Response.json(data);
    }
    // 50초 초과 → KIS 재호출하여 price_quotes 갱신 (V3_STALE_QUOTE 방지)
  }

  // 캐시 미스 시 KIS API 직접 호출
  // DB 조회는 "KR-005930" 그대로, KIS 호출에만 접두사 제거
  const code = stockId.replace(/^(KR|US)-/, "");

  try {
    const token = await getKisToken();
    const kisData = await fetchKisQuote(code, token);

    if (kisData.rt_cd !== "0") {
      return Response.json({ error: "QUOTE_NOT_FOUND" }, { status: 404 });
    }

    const output = kisData.output;
    const fetched_at = new Date().toISOString();
    const quote = {
      stock_id: stockId,
      price: Number(output.stck_prpr),
      prev_close: Number(output.stck_sdpr),
      change_rate: Number(output.prdy_ctrt),
      fetched_at,
    };

    // execute_order RPC가 price_quotes를 읽으므로 반드시 저장
    // SECURITY DEFINER 함수로 호출 → RLS 우회
    const { error: upsertError } = await supabase.rpc("upsert_price_quote", {
      p_stock_id: stockId,
      p_price: quote.price,
      p_prev_close: quote.prev_close,
      p_change_rate: quote.change_rate,
    });
    if (upsertError) {
      console.error("[quote] price_quotes upsert 실패:", upsertError.message);
    }

    return Response.json(quote);
  } catch {
    return Response.json({ error: "QUOTE_NOT_FOUND" }, { status: 404 });
  }
}
