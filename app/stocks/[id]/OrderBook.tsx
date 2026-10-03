import { formatPrice } from "./types";

export type OrderBookLevel = {
  price: number;
  quantity: number;
};

export type OrderBookData = {
  asks: OrderBookLevel[]; // 매도 호가 (위→아래: 높은 가격 먼저)
  bids: OrderBookLevel[]; // 매수 호가 (위→아래: 현재가에 가까운 가격 먼저)
};

// 한국 KRW 호가단위 근사. 정식 규정은 가격대별로 더 세분화됨.
// ponytail: 단순 계단 근사, KIS 호가 API 연동 시 실제 단위로 교체
function tickSize(price: number, currency: string): number {
  if (currency === "USD") return 0.01;
  if (price < 2000) return 1;
  if (price < 5000) return 5;
  if (price < 20000) return 10;
  if (price < 50000) return 50;
  if (price < 200000) return 100;
  if (price < 500000) return 500;
  return 1000;
}

// 목업 호가 생성 — 현재가 기준 ±호가단위로 10호가를 결정적으로 생성(렌더마다 흔들리지 않음).
// UI ↔ 데이터 분리: 나중에 이 함수 대신 KIS 호가 API 응답을 OrderBook에 그대로 넘기면 됨.
export function buildMockOrderBook(
  price: number,
  currency: string
): OrderBookData {
  const tick = tickSize(price, currency);
  // 잔량 고정 패턴 (결정적) — offset 5→1 (매도 위→아래), offset 1→5 (매수 위→아래)
  const askQty = [3120, 5580, 2240, 8010, 4670];
  const bidQty = [6450, 3890, 7220, 2980, 5110];
  const asks = askQty.map((quantity, i) => ({
    price: price + tick * (askQty.length - i),
    quantity,
  }));
  const bids = bidQty.map((quantity, i) => ({
    price: price - tick * (i + 1),
    quantity,
  }));
  return { asks, bids };
}

function QtyCell({
  quantity,
  maxQty,
  align,
  tint,
}: {
  quantity: number;
  maxQty: number;
  align: "left" | "right";
  tint: string;
}) {
  const ratio = maxQty > 0 ? (quantity / maxQty) * 100 : 0;
  return (
    <div
      className={`relative flex items-center px-3 py-1.5 ${
        align === "right" ? "justify-end" : "justify-start"
      }`}
    >
      {/* 잔량 비율 막대 (배경) */}
      <div
        className={`absolute inset-y-1 ${
          align === "right" ? "right-0" : "left-0"
        } rounded-sm ${tint}`}
        style={{ width: `${ratio}%` }}
      />
      <span className="relative text-xs text-fg-secondary">
        {quantity.toLocaleString()}
      </span>
    </div>
  );
}

type Props = {
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
  currentPrice: number | null;
  currency: string;
};

// 10호가 호가창. 한국 HTS 관행: 매도=파랑(price-down), 매수=빨강(price-up).
// 순수 표시 컴포넌트 — 데이터는 props로 받음(목업/실시간 무관).
export default function OrderBook({
  asks,
  bids,
  currentPrice,
  currency,
}: Props) {
  const maxQty = Math.max(
    1,
    ...asks.map((l) => l.quantity),
    ...bids.map((l) => l.quantity)
  );

  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-border">
      {/* 매도 호가 (위) */}
      <div className="grid grid-cols-[1fr_auto_1fr]">
        {asks.map((level) => (
          <div key={`ask-${level.price}`} className="contents">
            <QtyCell
              quantity={level.quantity}
              maxQty={maxQty}
              align="right"
              tint="bg-price-down/15"
            />
            <div className="flex items-center justify-center px-4 py-1.5 text-sm font-medium text-price-down">
              {formatPrice(level.price, currency)}
            </div>
            <div aria-hidden />
          </div>
        ))}
      </div>

      {/* 현재가 (중앙) */}
      <div className="flex items-center justify-center border-y border-border bg-surface px-4 py-2 text-sm font-semibold text-fg-primary">
        {currentPrice !== null ? formatPrice(currentPrice, currency) : "-"}
      </div>

      {/* 매수 호가 (아래) */}
      <div className="grid grid-cols-[1fr_auto_1fr]">
        {bids.map((level) => (
          <div key={`bid-${level.price}`} className="contents">
            <div aria-hidden />
            <div className="flex items-center justify-center px-4 py-1.5 text-sm font-medium text-price-up">
              {formatPrice(level.price, currency)}
            </div>
            <QtyCell
              quantity={level.quantity}
              maxQty={maxQty}
              align="left"
              tint="bg-price-up/15"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
