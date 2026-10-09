"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

import AccountHeader from "./AccountHeader";
import AssetTrendChart from "./AssetTrendChart";
import CashCard from "./CashCard";
import HoldingList from "./HoldingList";
import TransactionList from "./TransactionList";
import type { Account, AssetSnapshot, Holding, Transaction } from "./types";

export default function AccountPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useSupabaseUser();

  const [account, setAccount] = useState<Account | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [snapshots, setSnapshots] = useState<AssetSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userLoading && !user) {
      router.replace("/login");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!user) return;

    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      const { data: accountRow, error: accountError } = await supabase
        .from("accounts")
        .select("id, cash_krw, cash_usd")
        .single();

      if (!active) return;

      if (accountError || !accountRow) {
        setError(accountError?.message ?? "계좌 정보를 불러오지 못했습니다");
        setLoading(false);
        return;
      }

      const [{ data: holdingRows }, { data: txRows }, { data: snapshotRows }] = await Promise.all([
        supabase
          .from("holdings")
          .select("stock_id, quantity, avg_price, currency, stocks(name_ko, name_en, ticker)")
          .eq("account_id", accountRow.id),
        supabase
          .from("transactions")
          .select("id, stock_id, side, quantity, price, currency, executed_at, stocks(name_ko, name_en)")
          .eq("account_id", accountRow.id)
          .order("executed_at", { ascending: false })
          .limit(20),
        // 일별 스냅샷 (매일 00:00 KST cron + 계좌 생성 트리거가 적재).
        // 헤더(마지막 행)와 추이 그래프가 같은 결과를 써서 헤더 값 = 그래프 끝점.
        // ponytail: 하루 1행이라 전체 조회. max_rows(1000) ≈ 2.7년치에 닿으면 기간 제한(gte snapshot_date)
        supabase
          .from("asset_snapshots")
          .select("snapshot_date, total_value_krw, pnl_krw, return_rate, created_at")
          .eq("account_id", accountRow.id)
          .order("snapshot_date", { ascending: true }),
      ]);

      let quotesByStock: Record<string, number> = {};
      if (holdingRows && holdingRows.length > 0) {
        const stockIds = holdingRows.map((h) => h.stock_id);
        const { data: quoteRows } = await supabase
          .from("price_quotes")
          .select("stock_id, price")
          .in("stock_id", stockIds);

        quotesByStock = Object.fromEntries(
          (quoteRows ?? []).map((q) => [q.stock_id, q.price])
        );
      }

      if (!active) return;

      setAccount(accountRow);
      setHoldings(
        (holdingRows ?? []).map((h) => ({
          ...h,
          stocks: Array.isArray(h.stocks) ? h.stocks[0] ?? null : h.stocks,
          currentPrice: quotesByStock[h.stock_id] ?? null,
        }))
      );
      setTransactions(
        (txRows ?? []).map((t) => ({
          ...t,
          stocks: Array.isArray(t.stocks) ? t.stocks[0] ?? null : t.stocks,
        }))
      );
      setSnapshots(snapshotRows ?? []);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [user]);

  if (userLoading || !user) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col bg-page px-6 py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <AccountHeader ready={!loading && account !== null} snapshot={snapshots.at(-1) ?? null} />

        {error && <p className="text-sm text-danger">{error}</p>}

        {/* 2컬럼: lg부터 좌(보유·체결) / 우(현금). 모바일은 DOM 순서대로
            현금 → 보유 → 체결 (기존 단일 컬럼 순서 유지) */}
        {loading ? (
          <p className="text-sm text-fg-secondary">불러오는 중...</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
            <div className="space-y-6 lg:order-2">
              <CashCard account={account} />
            </div>
            <div className="space-y-6 lg:order-1">
              <AssetTrendChart snapshots={snapshots} />
              <HoldingList holdings={holdings} />
              <TransactionList transactions={transactions} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
