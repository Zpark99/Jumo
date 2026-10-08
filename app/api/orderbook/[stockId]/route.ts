import type { NextRequest } from "next/server";

import { SUPPORTED_MARKETS } from "@/lib/constants";
import { getKisBaseUrl, getKisToken } from "@/lib/kis";

// KIS 호가 응답은 askp1..askp10 / bidp1..bidp10 처럼 번호가 붙은 평면 구조라
// 인덱스 접근을 위해 문자열 키 맵으로 받는다.
type KisAskingPriceResponse = {
  rt_cd: string;
  output1?: Record<string, string>;
};

export type OrderBookLevel = {
  price: number;
  quantity: number;
};

export type OrderBookData = {
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
};

const LEVELS = 10;

async function fetchKisOrderBook(
  code: string,
  token: string
): Promise<KisAskingPriceResponse> {
  const baseUrl = getKisBaseUrl();
  const url = new URL(
    `${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn`
  );
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);

  const res = await fetch(url.toString(), {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: process.env.KIS_APP_KEY!,
      appsecret: process.env.KIS_APP_SECRET!,
      tr_id: "FHKST01010200",
      custtype: "P",
    },
  });
  return res.json();
}

// 0 이하·비숫자 호가는 버린다. KIS는 rt_cd=0으로 성공을 주면서도 값이 비어
// 있을 수 있어(#120), 여기서 걸러내지 않으면 빈 호가창이 그려진다.
function toLevel(
  o: Record<string, string>,
  priceKey: string,
  qtyKey: string
): OrderBookLevel | null {
  const price = Number(o[priceKey]);
  const quantity = Number(o[qtyKey]);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, quantity: Number.isFinite(quantity) ? quantity : 0 };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  const { stockId } = await params;

  // 해외는 KIS 권한이 없어 조회 불가 (#120). 국내 종목만 처리한다.
  const market = stockId.split("-")[0];
  if (!SUPPORTED_MARKETS.includes(market as (typeof SUPPORTED_MARKETS)[number])) {
    return Response.json({ error: "ORDERBOOK_NOT_SUPPORTED" }, { status: 404 });
  }

  // KIS 호출에만 접두사 제거 (/api/quote와 동일 규칙)
  const code = stockId.replace(/^(KR|US)-/, "");

  try {
    const token = await getKisToken();
    const kisData = await fetchKisOrderBook(code, token);

    if (kisData.rt_cd !== "0" || !kisData.output1) {
      return Response.json({ error: "ORDERBOOK_NOT_FOUND" }, { status: 404 });
    }

    const o = kisData.output1;

    // 표시 순서: 매도는 위→아래로 높은 가격 먼저(askp10 → askp1),
    // 매수는 현재가에 가까운 것 먼저(bidp1 → bidp10). OrderBook 컴포넌트 계약.
    const asks: OrderBookLevel[] = [];
    for (let i = LEVELS; i >= 1; i--) {
      const level = toLevel(o, `askp${i}`, `askp_rsqn${i}`);
      if (level) asks.push(level);
    }

    const bids: OrderBookLevel[] = [];
    for (let i = 1; i <= LEVELS; i++) {
      const level = toLevel(o, `bidp${i}`, `bidp_rsqn${i}`);
      if (level) bids.push(level);
    }

    if (asks.length === 0 && bids.length === 0) {
      return Response.json({ error: "ORDERBOOK_NOT_FOUND" }, { status: 404 });
    }

    return Response.json({ stock_id: stockId, asks, bids } satisfies {
      stock_id: string;
    } & OrderBookData);
  } catch {
    return Response.json({ error: "ORDERBOOK_NOT_FOUND" }, { status: 404 });
  }
}
