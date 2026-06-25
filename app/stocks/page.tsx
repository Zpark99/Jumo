"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

type StockResult = {
  id: string;
  ticker: string;
  name_ko: string | null;
  name_en: string | null;
  market: string;
  currency: string;
};

export default function StocksSearchPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useSupabaseUser();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockResult[]>([]);
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
        .or(
          `name_ko.ilike.%${escaped}%,name_en.ilike.%${escaped}%,ticker.ilike.%${escaped}%`
        )
        .limit(20);

      if (!active) return;

      if (searchError) {
        setError(searchError.message);
        setResults([]);
      } else {
        setResults(data ?? []);
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

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
          종목 검색
        </h1>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="종목명 또는 티커로 검색 (예: 삼성전자, 005930)"
          autoFocus
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-950 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        {searching && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">검색 중...</p>
        )}

        {!searching && query.trim() && results.length === 0 && !error && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            검색 결과가 없습니다
          </p>
        )}

        {results.length > 0 && (
          <ul className="divide-y divide-zinc-100 rounded-3xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {results.map((s) => {
              const name = s.name_ko ?? s.name_en ?? s.id;
              return (
                <li key={s.id}>
                  <Link
                    href={`/stocks/${s.id}`}
                    className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                        {name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {s.ticker} · {s.market}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {s.currency}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
