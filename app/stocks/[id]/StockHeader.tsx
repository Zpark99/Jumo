import { formatPrice, type Quote } from "./types";

type Props = {
  stockName: string;
  ticker: string;
  quote: Quote | null;
  quoteLoading: boolean;
  currency: string;
  quoteError: string | null;
};

// 헤더: 종목명 + 현재가·등락 상시 노출 (quote 폴링은 page.tsx 유지, 표시만 담당)
export default function StockHeader({
  stockName,
  ticker,
  quote,
  quoteLoading,
  currency,
  quoteError,
}: Props) {
  // 등락: change_rate(전일대비율, 이미 %) 우선, 없으면 전일종가와의 차로 방향 판단
  const diff =
    quote && quote.prev_close !== null ? quote.price - quote.prev_close : null;
  const rate = quote?.change_rate ?? null;
  const direction = rate ?? diff ?? 0;
  const changeColor =
    direction > 0
      ? "text-price-up"
      : direction < 0
        ? "text-price-down"
        : "text-fg-secondary";
  const sign = direction > 0 ? "+" : "";

  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">{stockName}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{ticker}</p>
        </div>
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-fg-secondary">
          지연 시세
        </span>
      </div>

      {/* 좁은 폭에선 등락이 통째로 다음 줄로 (#174) */}
      <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {quoteLoading ? (
          <div className="h-10 w-44 animate-pulse rounded-lg bg-surface" />
        ) : (
          <p className="text-4xl font-semibold text-fg-primary">
            {quote ? formatPrice(quote.price, currency) : "-"}
          </p>
        )}
        {quote && (diff !== null || rate !== null) && (
          <span className={`whitespace-nowrap text-sm font-medium ${changeColor}`}>
            {diff !== null && `${sign}${formatPrice(diff, currency)}`}
            {diff !== null && rate !== null && " "}
            {rate !== null && `(${sign}${rate.toFixed(2)}%)`}
          </span>
        )}
      </div>

      {quoteError && <p className="mt-2 text-sm text-danger">{quoteError}</p>}
    </div>
  );
}
