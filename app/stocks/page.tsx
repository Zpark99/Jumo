"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { SUPPORTED_MARKETS } from "@/lib/constants";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import StockList, {
  fetchQuotes,
  type Stock,
  type QuoteMap,
} from "@/components/home/StockList";

export default function StocksSearchPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useSupabaseUser();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Stock[]>([]);
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userLoading && !user) {
      router.replace("/login");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!user) return;

    let active = true;

    function reset() {
      setResults([]);
      setSearching(false);
      setError(null);
    }

    const trimmed = query.trim();
    if (!trimmed) {
      reset();
      return;
    }

    function beginSearch() {
      setSearching(true);
      setError(null);
    }
    beginSearch();

    const timer = setTimeout(async () => {
      const escaped = trimmed.replace(/[%,()]/g, "");
      const { data, error: searchError } = await supabase
        .from("stocks")
        .select("id, ticker, name_ko, name_en, market, currency")
        .in("market", SUPPORTED_MARKETS) // 해외는 시세 조회 불가라 숨김 (#120)
        .or(
          `name_ko.ilike.%${escaped}%,name_en.ilike.%${escaped}%,ticker.ilike.%${escaped}%`
        )
        .limit(20);

      if (!active) return;

      if (searchError) {
        setError(searchError.message);
        setResults([]);
      } else {
        const rows = data ?? [];
        const map = rows.length > 0 ? await fetchQuotes(rows.map((s) => s.id)) : {};
        if (!active) return;
        setQuotes(map);
        setResults(rows);
      }
      setSearching(false);
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [user, query]);

  if (userLoading || !user) {
    return null;
  }

  const trimmed = query.trim();

  return (
    <div className="flex flex-1 flex-col bg-page px-4 py-6 sm:px-6 lg:py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6 break-keep">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">종목 검색</h1>
          <p className="mt-1 text-sm text-fg-secondary">
            국내 종목 · 현재가는 지연 시세
          </p>
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="종목명 또는 종목코드 (예: 삼성전자, 005930)"
          aria-label="종목 검색"
          autoFocus
          className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-fg-primary outline-none focus:border-brand"
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        {!trimmed ? (
          <section className="rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm font-medium text-fg-primary">
              종목명이나 종목코드로 검색하세요
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              해외 종목은 아직 지원하지 않습니다
            </p>
          </section>
        ) : searching ? (
          /* 스켈레톤 3줄 — 실제 행과 같은 높이 */
          <section className="divide-y divide-border rounded-3xl border border-border bg-card">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6"
              >
                <div className="space-y-2">
                  <div className="h-3.5 w-24 animate-pulse rounded bg-surface" />
                  <div className="h-3 w-20 animate-pulse rounded bg-surface" />
                </div>
                <div className="h-4 w-20 animate-pulse rounded bg-surface" />
              </div>
            ))}
          </section>
        ) : results.length > 0 ? (
          <StockList stocks={results} quotes={quotes} />
        ) : (
          !error && (
            <section className="rounded-3xl border border-border bg-card p-8 text-center">
              <p className="text-sm font-medium text-fg-primary">
                &lsquo;{trimmed}&rsquo; 검색 결과가 없습니다
              </p>
              <p className="mt-1 text-xs text-fg-muted">
                종목명이나 6자리 종목코드를 다시 확인해 주세요
              </p>
            </section>
          )
        )}
      </div>
    </div>
  );
}
