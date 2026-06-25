"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

type Account = {
  id: string;
  cash_krw: number;
  cash_usd: number;
};

type Holding = {
  stock_id: string;
  quantity: number;
  avg_price: number;
  currency: string;
  stocks: { name_ko: string | null; name_en: string | null; ticker: string } | null;
  currentPrice: number | null;
};

type Transaction = {
  id: string;
  stock_id: string;
  side: string;
  quantity: number;
  price: number;
  currency: string;
  executed_at: string;
  stocks: { name_ko: string | null; name_en: string | null } | null;
};

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "ko-KR", {
    style: "currency",
    currency,
  }).format(price);
}

export default function AccountPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useSupabaseUser();

  const [account, setAccount] = useState<Account | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
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

      const [{ data: holdingRows }, { data: txRows }] = await Promise.all([
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
    <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
          내 계좌
        </h1>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {loading ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중...</p>
        ) : (
          <>
            {/* 현금 잔고 */}
            <section className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                현금 잔고
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">KRW</p>
                  <p className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                    {formatPrice(account?.cash_krw ?? 0, "KRW")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">USD</p>
                  <p className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                    {formatPrice(account?.cash_usd ?? 0, "USD")}
                  </p>
                </div>
              </div>
            </section>

            {/* 보유 종목 */}
            <section className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                보유 종목
              </h2>

              {holdings.length === 0 ? (
                <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                  보유 중인 종목이 없습니다
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
                  {holdings.map((h) => {
                    const pnl =
                      h.currentPrice !== null
                        ? (h.currentPrice - h.avg_price) * h.quantity
                        : null;
                    const name = h.stocks?.name_ko ?? h.stocks?.name_en ?? h.stock_id;

                    return (
                      <li
                        key={h.stock_id}
                        className="flex items-center justify-between py-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                            {name}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {h.quantity}주 · 평단 {formatPrice(h.avg_price, h.currency)}
                          </p>
                        </div>
                        <p
                          className={
                            pnl === null
                              ? "text-sm text-zinc-400 dark:text-zinc-600"
                              : pnl >= 0
                                ? "text-sm font-medium text-green-700 dark:text-green-400"
                                : "text-sm font-medium text-red-500"
                          }
                        >
                          {pnl !== null ? formatPrice(pnl, h.currency) : "-"}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* 최근 체결내역 */}
            <section className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                최근 체결내역
              </h2>

              {transactions.length === 0 ? (
                <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                  체결 내역이 없습니다
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
                  {transactions.map((t) => {
                    const name = t.stocks?.name_ko ?? t.stocks?.name_en ?? t.stock_id;

                    return (
                      <li
                        key={t.id}
                        className="flex items-center justify-between py-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                            {name}{" "}
                            <span className="text-zinc-400 dark:text-zinc-500">
                              ({t.side === "buy" ? "매수" : "매도"})
                            </span>
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {new Date(t.executed_at).toLocaleString("ko-KR")}
                          </p>
                        </div>
                        <p className="text-sm text-zinc-950 dark:text-zinc-50">
                          {t.quantity}주 · {formatPrice(t.price, t.currency)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
