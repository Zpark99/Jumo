import { formatPrice } from "./types";

type Props = {
  side: "buy" | "sell";
  stockName: string;
  quantity: number;
  estimatedAmount: number | null;
  currency: string;
  holdingQty: number;
  orderError: string | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

// 주문 확인 모달. onCancel/onConfirm은 page.tsx 핸들러(handleConfirmOrder 등) 그대로 연결.
export default function ConfirmModal({
  side,
  stockName,
  quantity,
  estimatedAmount,
  currency,
  holdingQty,
  orderError,
  submitting,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 px-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold text-fg-primary">
          {side === "buy" ? "매수 주문 확인" : "매도 주문 확인"}
        </h3>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-fg-secondary">종목</span>
            <span className="text-fg-primary">{stockName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-secondary">수량</span>
            <span className="text-fg-primary">{quantity}주</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-secondary">
              {side === "buy" ? "예상금액" : "예상 회수금액"}
            </span>
            <span className="text-fg-primary">
              {estimatedAmount !== null
                ? formatPrice(estimatedAmount, currency)
                : "-"}
            </span>
          </div>
        </div>

        {side === "sell" && quantity > holdingQty && (
          <p className="mt-4 text-sm text-danger">
            보유 수량({holdingQty}주)을 초과했습니다
          </p>
        )}

        {orderError && <p className="mt-4 text-sm text-danger">{orderError}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-fg-primary transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || (side === "sell" && quantity > holdingQty)}
            className="flex-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-pressed disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting ? "처리 중..." : "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}
