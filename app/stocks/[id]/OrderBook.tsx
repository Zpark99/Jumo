import type { OrderBookLevel } from "@/app/api/orderbook/[stockId]/route";

import { formatPrice } from "./types";

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
