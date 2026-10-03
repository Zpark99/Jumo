import type { Quote } from "./types";

type Props = {
  holdingQty: number;
  quantity: number;
  setQuantity: (qty: number) => void;
  quote: Quote | null;
  showConfirm: boolean;
  orderError: string | null;
  onBuy: () => void;
  onSell: () => void;
};

// 주문 패널. onClick·disabled 로직은 page.tsx 핸들러 그대로 연결 — className만 조정(R1).
export default function OrderPanel({
  holdingQty,
  quantity,
  setQuantity,
  quote,
  showConfirm,
  orderError,
  onBuy,
  onSell,
}: Props) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-fg-secondary">주문</h2>
        <span className="text-xs text-fg-muted">보유 {holdingQty}주</span>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block text-xs font-medium text-fg-secondary">
          수량
        </label>
        <input
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(e) =>
            setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))
          }
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-fg-primary outline-none focus:border-brand"
        />

        {/* 매수 = price-up(빨강), 한국 증권 관행 (R1) */}
        <button
          type="button"
          onClick={onBuy}
          disabled={!quote || quantity <= 0}
          className="flex w-full items-center justify-center rounded-xl bg-price-up px-4 py-2.5 text-sm font-medium text-white transition-colors hover:brightness-95 disabled:pointer-events-none disabled:opacity-50"
        >
          매수
        </button>

        {/* 매도 = price-down(파랑) (R1) */}
        <button
          type="button"
          onClick={onSell}
          disabled={!quote || quantity <= 0 || holdingQty <= 0}
          className="flex w-full items-center justify-center rounded-xl bg-price-down px-4 py-2.5 text-sm font-medium text-white transition-colors hover:brightness-95 disabled:pointer-events-none disabled:opacity-50"
        >
          매도
        </button>

        {orderError && !showConfirm && (
          <p className="text-sm text-red-500">{orderError}</p>
        )}
      </div>
    </div>
  );
}
