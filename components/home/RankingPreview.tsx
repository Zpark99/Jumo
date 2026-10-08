"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";

type RankRow = {
  account_id: string;
  user_nickname: string | null;
  return_rate: number | null;
  rank: number | null;
};

function formatPct(rate: number) {
  return `${rate >= 0 ? "+" : ""}${(rate * 100).toFixed(2)}%`;
}

// 한국식: 이익 price-up(빨강) / 손실 price-down(파랑) / 보합 flat (#52)
function rateColor(rate: number) {
  return rate > 0 ? "text-price-up" : rate < 0 ? "text-price-down" : "text-price-flat";
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      {children}
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-medium text-fg-secondary">실시간 랭킹</h2>
      <Link
        href="/ranking"
        className="text-xs font-medium text-fg-secondary underline hover:text-fg-primary"
      >
        전체 보기
      </Link>
    </div>
  );
}

export default function RankingPreview({
  userId,
  authLoading,
}: {
  userId: string | null;
  authLoading: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RankRow[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setLoading(false);
      return;
    }

    let active = true;

    async function load() {
      setLoading(true);

      const { data: seasonId } = await supabase.rpc(
        "get_or_create_current_season"
      );
      if (!active) return;
      if (!seasonId) {
        setRows([]);
        setLoading(false);
        return;
      }

      // /ranking과 동일 조회 — top 5만
      const { data } = await supabase
        .from("season_rankings")
        .select("account_id, user_nickname, return_rate, rank")
        .eq("season_id", seasonId)
        .order("rank", { ascending: true })
        .limit(5);

      if (!active) return;
      setRows(data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [userId, authLoading]);

  // 비로그인 유도 (season_rankings는 authenticated 전용)
  if (!authLoading && !userId) {
    return (
      <Card>
        <Header />
        <p className="mt-2 text-xs text-fg-muted">
          로그인하고 실시간 랭킹을 확인하세요
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <Header />
        <p className="mt-4 text-sm text-fg-secondary">불러오는 중...</p>
      </Card>
    );
  }

  return (
    <Card>
      <Header />
      {rows.length === 0 ? (
        <p className="mt-4 text-xs text-fg-muted">
          아직 랭킹이 집계되지 않았습니다
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li
              key={r.account_id}
              className="flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <span className="w-5 text-xs font-semibold text-fg-muted">
                  {r.rank ?? "-"}
                </span>
                <span className="text-xs text-fg-primary">
                  {r.user_nickname ?? "알 수 없음"}
                </span>
              </span>
              <span
                className={`text-xs font-semibold ${rateColor(
                  r.return_rate ?? 0
                )}`}
              >
                {formatPct(r.return_rate ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
