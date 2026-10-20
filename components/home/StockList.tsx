"use client";

import Link from "next/link";

import { supabase } from "@/lib/supabase";

export type Stock = {
  id: string;
  ticker: string;
  name_ko: string | null;
  name_en: string | null;
  market: string;
  currency: string;
};

type Quote = { price: number; change_rate: number | null; fetched_at: string };

export type QuoteMap = Record<string, Quote | undefined>;

// price_quotes 캐시(DB)만 읽는다 — KIS 호출 없음. 행이 없는 종목은 "-"로 그려진다.
// quotes가 null이면 아직 조회 전 → 가격 자리 스켈레톤 (#172)
export async function fetchQuotes(stockIds: string[]): Promise<QuoteMap> {
  const { data } = await supabase
    .from("price_quotes")
    .select("stock_id, price, change_rate, fetched_at")
    .in("stock_id", stockIds);

  const map: QuoteMap = {};
  for (const q of data ?? []) {
    map[q.stock_id] = {
      price: q.price,
      change_rate: q.change_rate,
      fetched_at: q.fetched_at,
    };
  }
  return map;
}

// KST 기준 "YYYY-MM-DD" (랭킹 formatUpdatedAt과 같은 방식)
function kstDate(date: Date) {
  return date.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 10);
}

// 시세가 오늘(KST) 것이 아니면 "MM/DD 기준" — 장 마감 후 일괄 갱신이 빠진 날도 드러나게 (#165)
function staleLabel(fetchedAt: string) {
  const day = kstDate(new Date(fetchedAt));
  if (day === kstDate(new Date())) return null;
  return `${day.slice(5, 7)}/${day.slice(8, 10)} 기준`;
}

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "ko-KR", {
    style: "currency",
    currency,
  }).format(price);
}

// 한국식: 상승 price-up(빨강) / 하락 price-down(파랑) / 보합 price-flat (#52)
function rateColor(rate: number) {
  return rate > 0 ? "text-price-up" : rate < 0 ? "text-price-down" : "text-price-flat";
}

export default function StockList({
  stocks,
  quotes,
  watchlist = {},
  onToggle,
  canToggle = false,
}: {
  stocks: Stock[];
  quotes: QuoteMap | null;
  watchlist?: Record<string, string>;
  onToggle?: (stockId: string) => void;
  canToggle?: boolean;
}) {
  return (
    <ul className="divide-y divide-border rounded-3xl border border-border bg-card">
      {stocks.map((s) => {
        const name = s.name_ko ?? s.name_en ?? s.id;
        const quote = quotes?.[s.id];
        const stale = quote ? staleLabel(quote.fetched_at) : null;
        const isWatched = !!watchlist[s.id];

        return (
          <li key={s.id}>
            <Link
              href={`/stocks/${s.id}`}
              className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface sm:px-6"
            >
              <div className="flex min-w-0 items-center gap-3">
                {canToggle && onToggle && (
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
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg-primary">
                    {name}
                  </p>
                  <p className="text-xs tabular-nums text-fg-secondary">
                    {s.ticker} · {s.market}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                {quotes === null ? (
                  <div className="h-4 w-20 animate-pulse rounded bg-surface" />
                ) : (
                  <p className="text-sm font-medium tabular-nums text-fg-primary">
                    {stale && (
                      <span className="mr-1.5 text-[11px] font-normal text-fg-muted">
                        {stale}
                      </span>
                    )}
                    {quote ? formatPrice(quote.price, s.currency) : "-"}
                  </p>
                )}
                {quote && quote.change_rate !== null && (
                  <p
                    className={`text-xs font-medium tabular-nums ${rateColor(quote.change_rate)}`}
                  >
                    {quote.change_rate > 0 ? "+" : ""}
                    {quote.change_rate.toFixed(2)}%
                  </p>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
