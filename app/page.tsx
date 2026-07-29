"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

type Stock = {
  id: string;
  ticker: string;
  name_ko: string | null;
  name_en: string | null;
  market: string;
  currency: string;
};

type QuoteMap = Record<string, number | undefined>;

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "ko-KR", {
    style: "currency",
    currency,
  }).format(price);
}

function getMarketStatus(): { open: boolean; label: string } {
  const kst = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const day = kst.getDay();
  const minutes = kst.getHours() * 60 + kst.getMinutes();
  const isWeekday = day >= 1 && day <= 5;
  const isOpenHours = minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
  const open = isWeekday && isOpenHours;
  return { open, label: open ? "장중" : "장마감" };
}

export default function Home() {
  const { user, loading: userLoading } = useSupabaseUser();

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [loadingStocks, setLoadingStocks] = useState(true);

  const [accountId, setAccountId] = useState<string | null>(null);
  // stock_id -> watchlist_items.id
  const [watchlist, setWatchlist] = useState<Record<string, string>>({});

  const marketStatus = useMemo(() => getMarketStatus(), []);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("stocks")
        .select("id, ticker, name_ko, name_en, market, currency")
        .order("ticker");

      if (!active) return;
      setStocks(data ?? []);
      setLoadingStocks(false);

      if (data && data.length > 0) {
        const { data: quoteRows } = await supabase
          .from("price_quotes")
          .select("stock_id, price")
          .in(
            "stock_id",
            data.map((s) => s.id)
          );

        if (!active) return;
        const map: QuoteMap = {};
        for (const q of quoteRows ?? []) {
          map[q.stock_id] = q.price;
        }
        setQuotes(map);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const loadWatchlist = useCallback(async () => {
    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .single();

    if (!account) return;
    setAccountId(account.id);

    const { data: items } = await supabase
      .from("watchlist_items")
      .select("id, stock_id")
      .eq("account_id", account.id);

    const map: Record<string, string> = {};
    for (const item of items ?? []) {
      map[item.stock_id] = item.id;
    }
    setWatchlist(map);
  }, []);

  useEffect(() => {
    async function run() {
      if (!user) {
        setAccountId(null);
        setWatchlist({});
        return;
      }
      await loadWatchlist();
    }
    run();
  }, [user, loadWatchlist]);

  const toggleWatchlist = async (stockId: string) => {
    if (!accountId) return;
    const existingId = watchlist[stockId];

    if (existingId) {
      setWatchlist((prev) => {
        const next = { ...prev };
        delete next[stockId];
        return next;
      });

      const { error } = await supabase
        .from("watchlist_items")
        .delete()
        .eq("id", existingId);

      if (error) loadWatchlist();
    } else {
      const { data, error } = await supabase
        .from("watchlist_items")
        .insert({ account_id: accountId, stock_id: stockId })
        .select("id")
        .single();

      if (error || !data) {
        loadWatchlist();
      } else {
        setWatchlist((prev) => ({ ...prev, [stockId]: data.id }));
      }
    }
  };

  const watchlistStocks = stocks.filter((s) => watchlist[s.id]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              주모, 모의투자 플랫폼
            </h1>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  marketStatus.open
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {marketStatus.label}
              </span>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                지연 시세
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/feed"
              className="text-sm font-medium text-zinc-600 underline hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              피드
            </Link>
            <Link
              href="/ranking"
              className="text-sm font-medium text-zinc-600 underline hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              랭킹
            </Link>

            {!userLoading && user && (
              <Link
                href="/account"
                className="text-sm font-medium text-zinc-600 underline hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                내 계좌
              </Link>
            )}
            {!userLoading && user && (
              <Link
                href="/mypage"
                className="text-sm font-medium text-zinc-600 underline hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                마이페이지
              </Link>
            )}
            {!userLoading && !user && (
              <Link
                href="/login"
                className="flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                로그인
              </Link>
            )}
          </div>
        </div>

        {/* 관심종목 */}
        {user && watchlistStocks.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              관심종목
            </h2>
            <StockList
              stocks={watchlistStocks}
              quotes={quotes}
              watchlist={watchlist}
              onToggle={toggleWatchlist}
              canToggle={!!accountId}
            />
          </section>
        )}

        {/* 전체 종목 */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            전체 종목
          </h2>

          {loadingStocks && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              불러오는 중...
            </p>
          )}

          {!loadingStocks && stocks.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              등록된 종목이 없습니다
            </p>
          )}

          {stocks.length > 0 && (
            <StockList
              stocks={stocks}
              quotes={quotes}
              watchlist={watchlist}
              onToggle={toggleWatchlist}
              canToggle={!!accountId}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function StockList({
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
    <ul className="divide-y divide-zinc-100 rounded-3xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {stocks.map((s) => {
        const name = s.name_ko ?? s.name_en ?? s.id;
        const price = quotes[s.id];
        const isWatched = !!watchlist[s.id];

        return (
          <li key={s.id}>
            <Link
              href={`/stocks/${s.id}`}
              className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
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
                        : "text-zinc-300 dark:text-zinc-600"
                    }`}
                  >
                    {isWatched ? "★" : "☆"}
                  </button>
                )}
                <div>
                  <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                    {name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {s.ticker} · {s.market}
                  </p>
                </div>
              </div>
              <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                {price !== undefined ? formatPrice(price, s.currency) : "-"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
