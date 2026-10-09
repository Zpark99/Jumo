import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import { QUOTE_CACHE_TTL_MS } from "@/lib/constants";
import { getKisBaseUrl, getKisToken } from "@/lib/kis";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type KisQuoteResponse = {
  rt_cd: string;
  output?: {
    stck_prpr?: string;
    stck_sdpr?: string;
    prdy_ctrt?: string;
  };
};

async function fetchKisQuote(code: string, token: string): Promise<KisQuoteResponse> {
  const baseUrl = getKisBaseUrl();
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
    if (ageMs < QUOTE_CACHE_TTL_MS) {
      return Response.json(data);
    }
    // 캐시 만료 → KIS 재호출하여 price_quotes 갱신 (V3_STALE_QUOTE 방지)
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
    const price = Number(output?.stck_prpr);
    const prevClose = Number(output?.stck_sdpr);
    const changeRate = Number(output?.prdy_ctrt);

    // 0 이하는 유효한 시세가 아니다. 해외 종목 코드를 국내 엔드포인트에 넘기면
    // rt_cd=0에 현재가 0이 돌아오는데(#120), 이를 저장하면 execute_order가
    // 0원에 체결해버린다. 저장도 반환도 하지 않는다.
    if (!Number.isFinite(price) || price <= 0) {
      return Response.json({ error: "QUOTE_NOT_FOUND" }, { status: 404 });
    }

    const fetched_at = new Date().toISOString();
    const quote = {
      stock_id: stockId,
      price,
      prev_close: Number.isFinite(prevClose) ? prevClose : null,
      change_rate: Number.isFinite(changeRate) ? changeRate : null,
      fetched_at,
    };

    // execute_order RPC가 price_quotes를 읽으므로 반드시 저장.
    // 시세 기록은 service_role 전용(#137) — anon 키로 열어두면 누구나 임의 시세를 넣을 수 있다.
    const { error: upsertError } = await supabaseAdmin.rpc("upsert_price_quote", {
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
