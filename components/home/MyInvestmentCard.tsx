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
    if (authLoading) return;
    if (!userId) {
      setLoading(false);
      return;
    }

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
      setSummary({ totalAsset, returnRate, holdings });
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
