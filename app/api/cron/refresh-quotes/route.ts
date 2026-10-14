import type { NextRequest } from "next/server";

import { SUPPORTED_MARKETS } from "@/lib/constants";
import { getKisToken } from "@/lib/kis";
import { fetchAndStoreQuote } from "@/lib/quotes";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// 장 마감 후 목록 시세 일괄 갱신 (#165). vercel.json cron이 평일 16시대(KST)에 호출한다.
// 상세를 안 연 종목은 price_quotes가 며칠씩 묵어 홈·/stocks 목록과 00:00 자산 스냅샷이
// 옛 가격을 쓰던 문제를 막는다.

// KIS 시세 호출은 초당 2건 미만으로
const CALL_INTERVAL_MS = 600;

export async function GET(request: NextRequest) {
  // Vercel이 CRON_SECRET을 Authorization: Bearer로 보낸다. 미설정이면 항상 거부
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: stocks, error } = await supabaseAdmin
    .from("stocks")
    .select("id")
    .in("market", SUPPORTED_MARKETS)
    .order("id");

  if (error) {
    console.error("[cron/refresh-quotes] 종목 조회 실패:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const token = await getKisToken();
  const updated: string[] = [];
  const failed: { stockId: string; reason: string }[] = [];

  // 순차 호출. 한 종목이 실패해도 나머지는 계속 갱신한다
  for (const [i, { id }] of (stocks ?? []).entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, CALL_INTERVAL_MS));
    try {
      const { quote, saveError } = await fetchAndStoreQuote(id, token);
      if (!quote) failed.push({ stockId: id, reason: "QUOTE_NOT_FOUND" });
      else if (saveError) failed.push({ stockId: id, reason: saveError });
      else updated.push(id);
    } catch (e) {
      failed.push({ stockId: id, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  if (failed.length > 0) {
    console.error("[cron/refresh-quotes] 실패 종목:", JSON.stringify(failed));
  }
  console.log(`[cron/refresh-quotes] 갱신 ${updated.length}건 · 실패 ${failed.length}건`);

  return Response.json({ updated, failed });
}
