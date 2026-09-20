"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

type Season = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
};

type RankingRow = {
  season_id: string;
  account_id: string;
  user_id: string;
  user_nickname: string | null;
  user_icon: string | null;
  total_asset: number | null;
  return_rate: number | null;
  rank: number | null;
  updated_at: string;
};

function formatKrw(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
  }).format(value);
}

function formatReturnRate(rate: number) {
  const pct = (rate * 100).toFixed(2);
  return `${rate >= 0 ? "+" : ""}${pct}%`;
}

function seasonLabel(season: Season) {
  const d = new Date(season.start_date);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 시즌`;
}

export default function RankingPage() {
  const { user, loading: userLoading } = useSupabaseUser();

  const [season, setSeason] = useState<Season | null>(null);
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [myAccountId, setMyAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  const loadRankings = useCallback(async (seasonId: string) => {
    const { data, error } = await supabase
      .from("season_rankings")
      .select(
        "season_id, account_id, user_id, user_nickname, user_icon, total_asset, return_rate, rank, updated_at"
      )
      .eq("season_id", seasonId)
      .order("rank", { ascending: true });

    if (error) {
      setLoadError(error.message);
      return;
    }
    setRankings(data ?? []);
  }, []);

  useEffect(() => {
    if (userLoading || !user) return;

    let active = true;

    async function load() {
      setLoading(true);
      setLoadError(null);

      const [{ data: seasonId, error: seasonErr }, { data: account }] =
        await Promise.all([
          supabase.rpc("get_or_create_current_season"),
          supabase.from("accounts").select("id").single(),
        ]);

      if (!active) return;

      if (seasonErr || !seasonId) {
        setLoadError(seasonErr?.message ?? "시즌 정보를 불러오지 못했습니다");
        setLoading(false);
        return;
      }

      setMyAccountId(account?.id ?? null);

      const { data: seasonRow, error: seasonRowErr } = await supabase
        .from("seasons")
        .select("id, name, start_date, end_date")
        .eq("id", seasonId)
        .single();

      if (!active) return;

      if (seasonRowErr || !seasonRow) {
        setLoadError(seasonRowErr?.message ?? "시즌 정보를 불러오지 못했습니다");
        setLoading(false);
        return;
      }

      setSeason(seasonRow);
      await loadRankings(seasonRow.id);
      if (!active) return;
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [user, userLoading, loadRankings]);

  const handleCalculate = async () => {
    if (!season) return;
    setCalculating(true);
    setCalcError(null);

    const { error } = await supabase.rpc("calculate_season_ranking", {
      p_season_id: season.id,
    });

    if (error) {
      setCalcError(error.message);
      setCalculating(false);
      return;
    }

    await loadRankings(season.id);
    setCalculating(false);
  };

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            시즌 랭킹
          </h1>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 underline hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            홈으로
          </Link>
        </div>

        {!userLoading && !user && (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              랭킹을 보려면 로그인이 필요합니다
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              로그인
            </Link>
          </section>
        )}

        {!userLoading && user && (
          <>
            {season && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {seasonLabel(season)}
                </p>
                <button
                  type="button"
                  onClick={handleCalculate}
                  disabled={calculating}
                  className="flex h-9 items-center justify-center rounded-full border border-zinc-300 px-4 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  {calculating ? "계산 중..." : "수동 스냅샷 갱신 (임시)"}
                </button>
              </div>
            )}

            {loadError && <p className="text-sm text-red-500">{loadError}</p>}
            {calcError && <p className="text-sm text-red-500">{calcError}</p>}

            {loading ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                불러오는 중...
              </p>
            ) : rankings.length === 0 ? (
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  아직 랭킹이 집계되지 않았습니다
                </p>
                <button
                  type="button"
                  onClick={handleCalculate}
                  disabled={calculating}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {calculating ? "계산 중..." : "지금 계산하기"}
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100 rounded-3xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
                {rankings.map((r) => {
                  const isMe = r.account_id === myAccountId;
                  return (
                    <li
                      key={r.account_id}
                      className={`flex items-center justify-between px-6 py-4 ${
                        isMe ? "bg-zinc-100 dark:bg-zinc-800/60" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-sm font-semibold text-zinc-400 dark:text-zinc-500">
                          {r.rank ?? "-"}
                        </span>
                        {r.user_icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.user_icon}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                            {r.user_nickname ?? "알 수 없음"}
                            {isMe && (
                              <span className="ml-2 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                                나
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {formatKrw(r.total_asset ?? 0)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-sm font-semibold ${
                          (r.return_rate ?? 0) >= 0
                            ? "text-price-up"
                            : "text-price-down"
                        }`}
                      >
                        {formatReturnRate(r.return_rate ?? 0)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
