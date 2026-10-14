import "server-only";

import { getKisBaseUrl } from "@/lib/kis";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// price_quotes에 쓰는 유일한 경로. /api/quote(상세 진입 시)와
// /api/cron/refresh-quotes(장 마감 후 일괄, #165)가 함께 쓴다.

type KisQuoteResponse = {
  rt_cd: string;
  output?: {
    stck_prpr?: string;
    stck_sdpr?: string;
    prdy_ctrt?: string;
  };
};

export type Quote = {
  stock_id: string;
  price: number;
  prev_close: number | null;
  change_rate: number | null;
  fetched_at: string;
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

// KIS 현재가를 조회해 price_quotes에 저장한다. 유효한 시세가 없으면 quote=null.
// 저장 실패는 saveError로 돌려준다(시세 자체는 반환 가능).
export async function fetchAndStoreQuote(
  stockId: string,
  token: string
): Promise<{ quote: Quote | null; saveError: string | null }> {
  // DB 조회는 "KR-005930" 그대로, KIS 호출에만 접두사 제거
  const code = stockId.replace(/^(KR|US)-/, "");
  const kisData = await fetchKisQuote(code, token);

  if (kisData.rt_cd !== "0") {
    return { quote: null, saveError: null };
  }

  const output = kisData.output;
  const price = Number(output?.stck_prpr);
  const prevClose = Number(output?.stck_sdpr);
  const changeRate = Number(output?.prdy_ctrt);

  // 0 이하는 유효한 시세가 아니다. 해외 종목 코드를 국내 엔드포인트에 넘기면
  // rt_cd=0에 현재가 0이 돌아오는데(#120), 이를 저장하면 execute_order가
  // 0원에 체결해버린다. 저장도 반환도 하지 않는다.
  if (!Number.isFinite(price) || price <= 0) {
    return { quote: null, saveError: null };
  }

  const quote: Quote = {
    stock_id: stockId,
    price,
    prev_close: Number.isFinite(prevClose) ? prevClose : null,
    change_rate: Number.isFinite(changeRate) ? changeRate : null,
    fetched_at: new Date().toISOString(),
  };

  // execute_order RPC가 price_quotes를 읽으므로 반드시 저장.
  // 시세 기록은 service_role 전용(#137) — anon 키로 열어두면 누구나 임의 시세를 넣을 수 있다.
  const { error: upsertError } = await supabaseAdmin.rpc("upsert_price_quote", {
    p_stock_id: stockId,
    p_price: quote.price,
    p_prev_close: quote.prev_close,
    p_change_rate: quote.change_rate,
  });

  return { quote, saveError: upsertError?.message ?? null };
}
