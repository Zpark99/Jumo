"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";
import { INDEX_CACHE_TTL_SEC, SUPPORTED_MARKETS } from "@/lib/constants";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import type { DomesticIndex, DomesticIndicesResponse } from "@/app/api/indices/route";
import StockList, {
  fetchQuotes,
  type Stock,
  type QuoteMap,
} from "@/components/home/StockList";
import MyInvestmentCard from "@/components/home/MyInvestmentCard";
import RankingPreview from "@/components/home/RankingPreview";
import IndexCardGrid, {
  buildMockIndices,
  type MarketIndex,
} from "@/components/home/IndexCardGrid";
import SchedulePanel, { buildMockSchedule } from "@/components/home/SchedulePanel";

// 조회 전·실패 시 카드 자리. 값이 null이라 "-"로 그려진다(목업 대체 금지, #108)
const EMPTY_DOMESTIC_INDICES: DomesticIndex[] = [
  { id: "kospi", name: "코스피", value: null, change: null, changePct: null },
  { id: "kosdaq", name: "코스닥", value: null, change: null, changePct: null },
];

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
  // null = 조회 전(스켈레톤). 조회 후 행이 없는 종목은 "-" (#172)
  const [quotes, setQuotes] = useState<QuoteMap | null>(null);
  const [loadingStocks, setLoadingStocks] = useState(true);

  const [accountId, setAccountId] = useState<string | null>(null);
  // stock_id -> watchlist_items.id
  const [watchlist, setWatchlist] = useState<Record<string, string>>({});

  const marketStatus = useMemo(() => getMarketStatus(), []);

  // null = 첫 조회 전(스켈레톤). 실패는 EMPTY로 "-" (#172)
  const [domesticIndices, setDomesticIndices] = useState<DomesticIndex[] | null>(
    null
  );

  // 국내지수(코스피·코스닥) 실데이터. 서버 캐시 TTL과 같은 주기로 폴링 — 더 자주
  // 불러도 캐시가 같은 값을 돌려줄 뿐이라 의미 없다 (#108)
  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch("/api/indices");
        if (!active) return;
        if (!res.ok) {
          setDomesticIndices(EMPTY_DOMESTIC_INDICES);
          return;
        }
        const data: DomesticIndicesResponse = await res.json();
        setDomesticIndices(data.indices);
      } catch {
        if (active) setDomesticIndices(EMPTY_DOMESTIC_INDICES);
      }
    }

    poll();
    const interval = setInterval(poll, INDEX_CACHE_TTL_SEC * 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // 실데이터 카드(스파크라인 없음) 앞, "예시" 목업 카드 뒤
  const indices: MarketIndex[] = [
    ...(domesticIndices ?? EMPTY_DOMESTIC_INDICES).map((i) => ({
      ...i,
      decimals: 2,
      loading: domesticIndices === null,
    })),
    ...buildMockIndices(),
  ];

  useEffect(() => {
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("stocks")
        .select("id, ticker, name_ko, name_en, market, currency")
        .in("market", SUPPORTED_MARKETS) // 해외는 시세 조회 불가라 숨김 (#120)
        .order("ticker");

      if (!active) return;
      setStocks(data ?? []);
      setLoadingStocks(false);

      if (data && data.length > 0) {
        const map = await fetchQuotes(data.map((s) => s.id));
        if (!active) return;
        setQuotes(map);
      } else {
        setQuotes({});
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
        {/* 페이지 제목 + 장 상태 뱃지 (내비는 전역 TopNav로 이동) */}
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">
            주모, 모의투자 플랫폼
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                marketStatus.open
                  ? "bg-success-tint text-success"
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

        {/* 3컬럼 셸: 모바일 단일 스택, lg부터 좌/중앙/우.
            모바일 순서는 중앙(종목) 먼저 → 관심종목 → 우 패널 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
          {/* 좌 사이드바 */}
          <aside className="order-2 space-y-6 lg:order-1">
            {/* 내 투자 요약 (실데이터) */}
            <MyInvestmentCard userId={user?.id ?? null} authLoading={userLoading} />

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
            {/* 지수 카드: 코스피·코스닥 실데이터 + 해외·환율·BTC "예시" (#108) */}
            <IndexCardGrid indices={indices} />

            {/* 실시간 랭킹 프리뷰 (실데이터) */}
            <RankingPreview userId={user?.id ?? null} authLoading={userLoading} />

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
            {/* 주요 일정 / 뉴스 (목업) */}
            <SchedulePanel items={buildMockSchedule()} isExample />
          </aside>
        </div>
      </div>
    </div>
  );
}
