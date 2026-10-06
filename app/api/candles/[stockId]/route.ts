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

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function fetchKisCandles(code: string, token: string): Promise<KisCandleResponse> {
  const baseUrl = getKisBaseUrl();
  const url = new URL(
    `${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`
  );

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - CANDLE_DAYS * 2);

  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);
  url.searchParams.set("FID_INPUT_DATE_1", formatDate(start));
  url.searchParams.set("FID_INPUT_DATE_2", formatDate(today));
  url.searchParams.set("FID_PERIOD_DIV_CODE", "D");
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
  _request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  const { stockId } = await params;
  // KIS 호출에만 접두사 제거 (/api/quote와 동일 규칙)
  const code = stockId.replace(/^(KR|US)-/, "");

  try {
    const token = await getKisToken();
    const kisData = await fetchKisCandles(code, token);

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
