"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

// 내부 집계 단위. 화면에는 노출하지 않는다 — v1.0 랭킹은 가입 시드 대비 누적 수익률(#67)
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
  return `${rate > 0 ? "+" : ""}${pct}%`;
}

// 한국식: 이익 price-up(빨강) / 손실 price-down(파랑) / 0은 flat (#52)
function rateColor(rate: number) {
  return rate > 0 ? "text-price-up" : rate < 0 ? "text-price-down" : "text-price-flat";
}

// 집계 시각을 KST "MM-DD HH:mm"로 (계좌 헤더 formatBasis와 같은 방식)
function formatUpdatedAt(iso: string) {
  return new Date(iso)
    .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
    .slice(5, 16);
}

// 1~3위는 배지로 구분, 그 외는 숫자만
function RankBadge({ rank }: { rank: number | null }) {
  if (rank === 1) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
        1
      </span>
    );
  }
  if (rank === 2 || rank === 3) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-bold text-brand">
        {rank}
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center text-sm font-semibold tabular-nums text-fg-muted">
      {rank ?? "-"}
    </span>
  );
}

function Avatar({ src }: { src: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
  ) : (
    <div className="h-9 w-9 shrink-0 rounded-full bg-surface" />
  );
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
        setLoadError(seasonErr?.message ?? "랭킹 정보를 불러오지 못했습니다");
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
        setLoadError(seasonRowErr?.message ?? "랭킹 정보를 불러오지 못했습니다");
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

  const myRow = rankings.find((r) => r.account_id === myAccountId) ?? null;
  const updatedAt = rankings[0]?.updated_at ?? null;

  return (
    <div className="flex flex-1 flex-col bg-page px-4 py-6 sm:px-6 lg:py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">누적 수익률 랭킹</h1>
          <p className="mt-1 text-sm text-fg-secondary">
            가입 시드 대비 누적 수익률 기준 · 매일 00:05·09:05 자동 집계
            {updatedAt && (
              <span className="tabular-nums"> · 마지막 집계 {formatUpdatedAt(updatedAt)}</span>
            )}
          </p>
        </div>

        {!userLoading && !user && (
          <section className="rounded-3xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-fg-secondary">
              랭킹을 보려면 로그인이 필요합니다
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-pressed"
            >
              로그인
            </Link>
          </section>
        )}

        {!userLoading && user && (
          <>
            {loadError && <p className="text-sm text-danger">{loadError}</p>}
            {calcError && <p className="text-sm text-danger">{calcError}</p>}

            {loading ? (
              /* 스켈레톤 3줄 — 실제 행과 같은 높이 */
              <section className="divide-y divide-border rounded-3xl border border-border bg-card">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-4 sm:px-6">
                    <div className="h-7 w-7 animate-pulse rounded-full bg-surface" />
                    <div className="h-9 w-9 animate-pulse rounded-full bg-surface" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-24 animate-pulse rounded bg-surface" />
                      <div className="h-3 w-32 animate-pulse rounded bg-surface" />
                    </div>
                    <div className="h-4 w-16 animate-pulse rounded bg-surface" />
                  </div>
                ))}
              </section>
            ) : rankings.length === 0 ? (
              <section className="rounded-3xl border border-border bg-card p-8 text-center">
                <p className="text-sm font-medium text-fg-primary">
                  아직 집계된 랭킹이 없습니다
                </p>
                <p className="mt-1 text-xs text-fg-muted">
                  매일 00:05·09:05에 자동으로 집계됩니다. 지금 바로 계산할 수도 있어요
                </p>
                <button
                  type="button"
                  onClick={handleCalculate}
                  disabled={calculating}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-pressed disabled:opacity-50"
                >
                  {calculating ? "계산 중..." : "지금 계산하기"}
                </button>
              </section>
            ) : (
              <>
                {/* 내 순위 요약 — 참가자가 적어 목록이 짧아도 화면이 비지 않게 */}
                {myRow && (
                  <section className="rounded-3xl border border-brand/30 bg-brand-tint p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-medium text-fg-secondary">내 순위</p>
                        <p className="mt-1 text-3xl font-semibold tabular-nums text-fg-primary">
                          {myRow.rank ?? "-"}
                          <span className="ml-1 text-base font-medium text-fg-secondary">
                            위
                          </span>
                          <span className="ml-2 text-sm font-normal text-fg-muted">
                            / {rankings.length}명
                          </span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-xl font-semibold tabular-nums ${rateColor(myRow.return_rate ?? 0)}`}
                        >
                          {formatReturnRate(myRow.return_rate ?? 0)}
                        </p>
                        <p className="mt-1 text-xs tabular-nums text-fg-secondary">
                          {formatKrw(myRow.total_asset ?? 0)}
                        </p>
                      </div>
                    </div>
                  </section>
                )}

                <section className="rounded-3xl border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
                    <h2 className="text-sm font-medium text-fg-secondary">
                      전체 순위
                      <span className="ml-1.5 tabular-nums text-fg-muted">
                        {rankings.length}명
                      </span>
                    </h2>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleCalculate}
                        disabled={calculating}
                        className="flex h-8 items-center justify-center rounded-full border border-border px-3 text-xs font-medium text-fg-secondary transition-colors hover:bg-surface disabled:opacity-50"
                      >
                        {calculating ? "계산 중..." : "지금 갱신"}
                      </button>
                    </div>
                  </div>

                  <ul className="divide-y divide-border border-t border-border">
                    {rankings.map((r) => {
                      const isMe = r.account_id === myAccountId;
                      return (
                        <li
                          key={r.account_id}
                          className={`flex items-center gap-3 px-5 py-4 sm:px-6 ${
                            isMe ? "bg-brand-tint/60" : ""
                          }`}
                        >
                          <RankBadge rank={r.rank} />
                          <Avatar src={r.user_icon} />
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2 text-sm font-medium text-fg-primary">
                              <span className="truncate">
                                {r.user_nickname ?? "알 수 없음"}
                              </span>
                              {isMe && (
                                <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                  나
                                </span>
                              )}
                            </p>
                            <p className="text-xs tabular-nums text-fg-secondary">
                              {formatKrw(r.total_asset ?? 0)}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 text-sm font-semibold tabular-nums ${rateColor(r.return_rate ?? 0)}`}
                          >
                            {formatReturnRate(r.return_rate ?? 0)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {rankings.length < 3 && (
                    <p className="border-t border-border px-5 py-4 text-center text-xs text-fg-muted sm:px-6">
                      아직 참가자가 {rankings.length}명이에요. 새 투자자가 가입하면
                      다음 집계부터 순위에 올라옵니다
                    </p>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
