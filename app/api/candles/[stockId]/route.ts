import type { NextRequest } from "next/server";

import { getKisBaseUrl, getKisToken } from "@/lib/kis";

type KisCandleResponse = {
  rt_cd: string;
  output2?: Array<{
    stck_bsop_date?: string;
    stck_oprc?: string;
    stck_hgpr?: string;
    stck_lwpr?: string;
    stck_clpr?: string;
    acml_vol?: string;
  }>;
};

export type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const CANDLE_DAYS = 100;

// 기간별 조회 구간. KIS는 한 번에 최대 100건을 주므로, 100봉을 채울 만큼
// 거슬러 올라간다(주봉 ~114주, 월봉 ~120개월).
export const CANDLE_PERIODS = ["D", "W", "M"] as const;
export type CandlePeriod = (typeof CANDLE_PERIODS)[number];

const LOOKBACK_DAYS: Record<CandlePeriod, number> = {
  D: CANDLE_DAYS * 2,
  W: 800,
  M: 3650,
};

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function fetchKisCandles(
  code: string,
  token: string,
  period: CandlePeriod
): Promise<KisCandleResponse> {
  const baseUrl = getKisBaseUrl();
  const url = new URL(
    `${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`
  );

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - LOOKBACK_DAYS[period]);

  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);
  url.searchParams.set("FID_INPUT_DATE_1", formatDate(start));
  url.searchParams.set("FID_INPUT_DATE_2", formatDate(today));
  // 일/주/월봉 모두 동일 TR(FHKST03010100), 이 코드만 D/W/M으로 바뀐다
  url.searchParams.set("FID_PERIOD_DIV_CODE", period);
  url.searchParams.set("FID_ORG_ADJ_PRC", "0");

  const res = await fetch(url.toString(), {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: process.env.KIS_APP_KEY!,
      appsecret: process.env.KIS_APP_SECRET!,
      tr_id: "FHKST03010100",
    },
  });
  return res.json();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  const { stockId } = await params;
  // KIS 호출에만 접두사 제거 (/api/quote와 동일 규칙)
  const code = stockId.replace(/^(KR|US)-/, "");

  const raw = request.nextUrl.searchParams.get("period");
  const period: CandlePeriod = CANDLE_PERIODS.includes(raw as CandlePeriod)
    ? (raw as CandlePeriod)
    : "D"; // 기본 일봉 (기존 동작 유지)

  try {
    const token = await getKisToken();
    const kisData = await fetchKisCandles(code, token, period);

    if (kisData.rt_cd !== "0") {
      return Response.json({ error: "CANDLES_NOT_FOUND" }, { status: 404 });
    }

    const rows = kisData.output2 ?? [];
    const candles: Candle[] = rows
      .filter((r) => r.stck_bsop_date && r.stck_clpr)
      .map((r) => ({
        date: r.stck_bsop_date!,
        open: Number(r.stck_oprc),
        high: Number(r.stck_hgpr),
        low: Number(r.stck_lwpr),
        close: Number(r.stck_clpr),
        volume: Number(r.acml_vol),
      }))
      .filter((c) => Number.isFinite(c.close))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-CANDLE_DAYS);

    if (candles.length === 0) {
      return Response.json({ error: "CANDLES_NOT_FOUND" }, { status: 404 });
    }

    return Response.json({ stock_id: stockId, candles });
  } catch {
    return Response.json({ error: "CANDLES_NOT_FOUND" }, { status: 404 });
  }
}
