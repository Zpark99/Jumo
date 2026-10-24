"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";

type HoldingRow = {
  stock_id: string;
  quantity: number;
  avg_price: number;
  currency: string;
  stocks: { name_ko: string | null; name_en: string | null } | null;
  currentPrice: number | null;
};

type Summary = {
  totalAsset: number | null; // season_rankings.total_asset (서버 집계)
  returnRate: number | null; // season_rankings.return_rate
  fromSnapshot: boolean; // 집계 전 → asset_snapshots 폴백 (#180)
  holdings: HoldingRow[];
};

function formatKrw(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
  }).format(value);
}

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

export default function MyInvestmentCard({
  userId,
  authLoading,
}: {
  userId: string | null;
  authLoading: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (authLoading || !userId) return; // 비로그인은 아래 렌더에서 먼저 분기

    let active = true;

    async function load() {
      setLoading(true);

      // RLS로 본인 계좌만 반환
      const { data: account } = await supabase
        .from("accounts")
        .select("id")
        .single();

      if (!active) return;
      if (!account) {
        setSummary(null);
        setLoading(false);
        return;
      }

      // 총자산·수익률: season_rankings(서버 집계) 재사용 — 직접 계산하지 않음
      const { data: seasonId } = await supabase.rpc(
        "get_or_create_current_season"
      );

      let totalAsset: number | null = null;
      let returnRate: number | null = null;
      if (seasonId) {
        const { data: myRank } = await supabase
          .from("season_rankings")
          .select("total_asset, return_rate")
          .eq("season_id", seasonId)
          .eq("account_id", account.id)
          .maybeSingle();
        if (myRank) {
          totalAsset = myRank.total_asset;
          returnRate = myRank.return_rate;
        }
      }

      // 집계 전(가입 직후 ~ 다음 00:05)이면 가입 트리거가 만든 스냅샷을 쓴다.
      // 같은 총자산 공식(KRW)이고 본인 행만 읽히므로 그대로 폴백 (#180)
      let fromSnapshot = false;
      if (totalAsset == null) {
        const { data: snap } = await supabase
          .from("asset_snapshots")
          .select("total_value_krw, return_rate")
          .eq("account_id", account.id)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (snap) {
          totalAsset = snap.total_value_krw;
          returnRate = snap.return_rate;
          fromSnapshot = true;
        }
      }

      // 보유종목 top: holdings + price_quotes (account 페이지와 동일 패턴)
      const { data: holdingRows } = await supabase
        .from("holdings")
        .select("stock_id, quantity, avg_price, currency, stocks(name_ko, name_en)")
        .eq("account_id", account.id);

      let quotesByStock: Record<string, number> = {};
      if (holdingRows && holdingRows.length > 0) {
        const { data: quoteRows } = await supabase
          .from("price_quotes")
          .select("stock_id, price")
          .in(
            "stock_id",
            holdingRows.map((h) => h.stock_id)
          );
        quotesByStock = Object.fromEntries(
          (quoteRows ?? []).map((q) => [q.stock_id, q.price])
        );
      }

      const holdings: HoldingRow[] = (holdingRows ?? [])
        .map((h) => ({
          ...h,
          stocks: Array.isArray(h.stocks) ? h.stocks[0] ?? null : h.stocks,
          currentPrice: quotesByStock[h.stock_id] ?? null,
        }))
        // 평가금액(현재가×수량) 큰 순으로 top 5
        .sort(
          (a, b) =>
            (b.currentPrice ?? 0) * b.quantity -
            (a.currentPrice ?? 0) * a.quantity
        )
        .slice(0, 5);

      if (!active) return;
      setSummary({ totalAsset, returnRate, fromSnapshot, holdings });
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [userId, authLoading]);

  // 비로그인 유도
  if (!authLoading && !userId) {
    return (
      <Card>
        <h2 className="text-sm font-medium text-fg-secondary">내 투자</h2>
        <p className="mt-2 text-xs text-fg-muted">
          로그인하고 모의투자를 시작하세요
        </p>
        <Link
          href="/login"
          className="mt-4 inline-flex h-9 items-center justify-center rounded-full bg-brand px-4 text-xs font-medium text-white transition-colors hover:bg-brand-pressed"
        >
          로그인
        </Link>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <h2 className="text-sm font-medium text-fg-secondary">내 투자</h2>
        <p className="mt-4 text-sm text-fg-secondary">불러오는 중...</p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-sm font-medium text-fg-secondary">내 투자</h2>

      {/* 총평가금액 + 총수익률 */}
      <div className="mt-3">
        <p className="text-lg font-semibold text-fg-primary">
          {summary?.totalAsset != null
            ? formatKrw(summary.totalAsset)
            : "평가 집계 전"}
        </p>
        {summary?.returnRate != null && (
          <p className={`text-sm font-medium ${rateColor(summary.returnRate)}`}>
            {formatPct(summary.returnRate)}
            <span className="ml-1 text-xs font-normal text-fg-muted">시드 대비</span>
          </p>
        )}
        {summary?.fromSnapshot && (
          <p className="mt-1 text-xs text-fg-muted">
            가입 시점 기준 · 매일 00:05 집계 후 갱신
          </p>
        )}
      </div>

      {/* 보유종목 top */}
      <div className="mt-4">
        {!summary || summary.holdings.length === 0 ? (
          <p className="text-xs text-fg-muted">보유 종목이 없습니다</p>
        ) : (
          <ul className="space-y-2">
            {summary.holdings.map((h) => {
              const name = h.stocks?.name_ko ?? h.stocks?.name_en ?? h.stock_id;
              const rate =
                h.currentPrice != null && h.avg_price > 0
                  ? (h.currentPrice - h.avg_price) / h.avg_price
                  : null;
              return (
                <li
                  key={h.stock_id}
                  className="flex items-center justify-between"
                >
                  <span className="text-xs text-fg-primary">{name}</span>
                  <span
                    className={`text-xs font-medium ${
                      rate == null ? "text-fg-muted" : rateColor(rate)
                    }`}
                  >
                    {rate != null ? formatPct(rate) : "-"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
