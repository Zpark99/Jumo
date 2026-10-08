"use client";

import Link from "next/link";

export type Stock = {
  id: string;
  ticker: string;
  name_ko: string | null;
  name_en: string | null;
  market: string;
  currency: string;
};

export type QuoteMap = Record<string, number | undefined>;

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "ko-KR", {
    style: "currency",
    currency,
  }).format(price);
}

export default function StockList({
  stocks,
  quotes,
  watchlist,
  onToggle,
  canToggle,
}: {
  stocks: Stock[];
  quotes: QuoteMap;
  watchlist: Record<string, string>;
  onToggle: (stockId: string) => void;
  canToggle: boolean;
}) {
  return (
    <ul className="divide-y divide-border rounded-3xl border border-border bg-card">
      {stocks.map((s) => {
        const name = s.name_ko ?? s.name_en ?? s.id;
        const price = quotes[s.id];
        const isWatched = !!watchlist[s.id];

        return (
          <li key={s.id}>
            <Link
              href={`/stocks/${s.id}`}
              className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-surface"
            >
              <div className="flex items-center gap-3">
                {canToggle && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggle(s.id);
                    }}
                    aria-label={isWatched ? "관심종목 제거" : "관심종목 추가"}
                    className={`text-lg leading-none ${
                      isWatched
                        ? "text-yellow-500"
                        : "text-fg-muted"
                    }`}
                  >
                    {isWatched ? "★" : "☆"}
                  </button>
                )}
                <div>
                  <p className="text-sm font-medium text-fg-primary">
                    {name}
                  </p>
                  <p className="text-xs text-fg-secondary">
                    {s.ticker} · {s.market}
                  </p>
                </div>
              </div>
              <span className="text-sm font-medium text-fg-primary">
                {price !== undefined ? formatPrice(price, s.currency) : "-"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
