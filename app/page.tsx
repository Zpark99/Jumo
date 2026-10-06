"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import StockList, { type Stock, type QuoteMap } from "@/components/home/StockList";

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

// PR-B·C에서 채울 영역 자리(빈 카드). 레이아웃 뼈대만 잡아둔다.
function PlaceholderCard({ title, hint }: { title: string; hint?: string }) {
  return (
    <section className="rounded-3xl border border-dashed border-border bg-card/50 p-6">
      <h2 className="text-sm font-medium text-fg-secondary">{title}</h2>
      <p className="mt-2 text-xs text-fg-muted">{hint ?? "준비 중"}</p>
    </section>
  );
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
    <div className="flex flex-1 flex-col bg-page px-4 py-6 sm:px-6 lg:py-10">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        {/* 헤더 (전역화 X — page.tsx 안에 유지) */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-fg-primary">
              주모, 모의투자 플랫폼
            </h1>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  marketStatus.open
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-surface text-fg-secondary"
                }`}
              >
                {marketStatus.label}
              </span>
              <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-fg-secondary">
                지연 시세
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/feed"
              className="text-sm font-medium text-fg-secondary underline hover:text-fg-primary"
            >
              피드
            </Link>
            <Link
              href="/ranking"
              className="text-sm font-medium text-fg-secondary underline hover:text-fg-primary"
            >
              랭킹
            </Link>

            {!userLoading && user && (
              <Link
                href="/account"
                className="text-sm font-medium text-fg-secondary underline hover:text-fg-primary"
              >
                내 계좌
              </Link>
            )}
            {!userLoading && user && (
              <Link
                href="/mypage"
                className="text-sm font-medium text-fg-secondary underline hover:text-fg-primary"
              >
                마이페이지
              </Link>
            )}
            {!userLoading && user && (
              <button
                type="button"
                onClick={() => supabase.auth.signOut()}
                className="text-sm font-medium text-fg-secondary underline hover:text-fg-primary"
              >
                로그아웃
              </button>
            )}
            {!userLoading && !user && (
              <Link
                href="/login"
                className="flex h-10 items-center justify-center rounded-full bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-pressed"
              >
                로그인
              </Link>
            )}
          </div>
        </div>

        {/* 3컬럼 셸: 모바일 단일 스택, lg부터 좌/중앙/우.
            모바일 순서는 중앙(종목) 먼저 → 관심종목 → 우 패널 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
          {/* 좌 사이드바 */}
          <aside className="order-2 space-y-6 lg:order-1">
            {/* 내 투자 자리 (PR-B에서 실데이터) */}
            <PlaceholderCard title="내 투자" />

            {/* 관심종목 (기존 기능 — 이동만) */}
            {user && watchlistStocks.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-fg-secondary">
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
          </aside>

          {/* 중앙 메인 */}
          <main className="order-1 space-y-6 lg:order-2">
            {/* 지수 카드 자리 (PR-C에서 채움) */}
            <PlaceholderCard title="지수" />

            {/* 전체 종목 (기존 기능 — 이동만) */}
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-fg-secondary">
                전체 종목
              </h2>

              {loadingStocks && (
                <p className="text-sm text-fg-secondary">
                  불러오는 중...
                </p>
              )}

              {!loadingStocks && stocks.length === 0 && (
                <p className="text-sm text-fg-secondary">
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
          </main>

          {/* 우 패널 */}
          <aside className="order-3 space-y-6">
            {/* 주요 일정 / 뉴스 자리 (PR-C에서 채움) */}
            <PlaceholderCard title="주요 일정 / 뉴스" />
          </aside>
        </div>
      </div>
    </div>
  );
}
