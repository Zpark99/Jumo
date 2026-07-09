"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import type { Candle } from "@/app/api/candles/[stockId]/route";

// execute_order가 반환하는 V1~V7 거부 사유를 사용자에게 보여줄 문구로 매핑
const REJECT_REASON_MESSAGES: Record<string, string> = {
  V1_INVALID_QUANTITY: "주문 수량이 올바르지 않습니다",
  V2_STOCK_NOT_FOUND: "종목 정보를 찾을 수 없습니다",
  V3_NO_QUOTE: "시세 정보가 없습니다. 다시 시도해주세요",
  V3_STALE_QUOTE: "시세가 오래되어 주문이 거부되었습니다. 다시 시도해주세요",
  V4_INVALID_LIMIT_PRICE: "지정가가 올바르지 않습니다",
  V5_INSUFFICIENT_CASH: "잔액이 부족합니다",
  V6_INSUFFICIENT_HOLDINGS: "보유 수량이 부족합니다",
};

type Stock = {
  id: string;
  ticker: string;
  name_ko: string | null;
  name_en: string | null;
  currency: string;
  market: string;
};

type Transaction = {
  id: string;
  side: string;
  quantity: number;
  price: number;
  currency: string;
  executed_at: string;
};

type Quote = {
  stock_id: string;
  price: number;
  prev_close: number | null;
  change_rate: number | null;
  fetched_at: string;
};

type OrderResult = {
  order_id: string | null;
  status: string;
  executed_price: number | null;
  executed_quantity: number | null;
  reject_reason: string | null;
};

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "ko-KR", {
    style: "currency",
    currency,
  }).format(price);
}

// KIS 응답 날짜(YYYYMMDD) -> "MM/DD" 축 라벨
function formatCandleDate(date: string) {
  return `${date.slice(4, 6)}/${date.slice(6, 8)}`;
}

async function fetchHoldingQty(stockId: string): Promise<number> {
  // holdings RLS(holdings_select_own)가 이미 본인 계좌로 필터링하므로 accounts 조회 없이 단일 쿼리로 처리
  const { data: holdingRow } = await supabase
    .from("holdings")
    .select("quantity")
    .eq("stock_id", stockId)
    .maybeSingle();

  return holdingRow?.quantity ?? 0;
}

export default function StockTradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: stockId } = use(params);
  const router = useRouter();
  const { user, loading: userLoading } = useSupabaseUser();

  const [stock, setStock] = useState<Stock | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [holdingQty, setHoldingQty] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const [activeTab, setActiveTab] = useState<
    "quote" | "chart" | "history" | "info"
  >("quote");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [candlesError, setCandlesError] = useState<string | null>(null);

  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!userLoading && !user) {
      router.replace("/login");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    supabase
      .from("stocks")
      .select("id, ticker, name_ko, name_en, currency, market")
      .eq("id", stockId)
      .single()
      .then(({ data }) => {
        if (data) setStock(data);
      });
  }, [stockId]);

  useEffect(() => {
    if (!user) return;

    let active = true;
    fetchHoldingQty(stockId).then((qty) => {
      if (active) setHoldingQty(qty);
    });
    return () => {
      active = false;
    };
  }, [user, stockId]);

  useEffect(() => {
    if (!user) return;

    let active = true;

    async function poll() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch(`/api/quote/${stockId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!active) return;

      if (!res.ok) {
        setQuoteError("시세를 불러오지 못했습니다");
        setQuote(null);
        return;
      }

      const data: Quote = await res.json();
      setQuote(data);
      setQuoteError(null);
    }

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user, stockId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (activeTab !== "chart" || candles !== null) return;

    let active = true;

    async function loadCandles() {
      setCandlesLoading(true);
      setCandlesError(null);

      try {
        const res = await fetch(`/api/candles/${stockId}`);
        if (!active) return;

        if (!res.ok) {
          setCandlesError("일봉 데이터를 불러오지 못했습니다");
          return;
        }

        const data: { candles: Candle[] } = await res.json();
        setCandles(data.candles);
      } catch {
        if (active) setCandlesError("일봉 데이터를 불러오지 못했습니다");
      } finally {
        if (active) setCandlesLoading(false);
      }
    }

    loadCandles();
    return () => {
      active = false;
    };
  }, [activeTab, candles, stockId]);

  useEffect(() => {
    if (activeTab !== "history" || transactions !== null) return;

    let active = true;

    async function loadTransactions() {
      setTransactionsLoading(true);
      setTransactionsError(null);

      // tx_select_own RLS가 이미 본인 계좌로 필터링하므로 stock_id만으로 조회
      const { data, error } = await supabase
        .from("transactions")
        .select("id, side, quantity, price, currency, executed_at")
        .eq("stock_id", stockId)
        .order("executed_at", { ascending: false });

      if (!active) return;

      if (error) {
        setTransactionsError("거래 내역을 불러오지 못했습니다");
      } else {
        setTransactions(data ?? []);
      }
      setTransactionsLoading(false);
    }

    loadTransactions();
    return () => {
      active = false;
    };
  }, [activeTab, transactions, stockId]);

  if (userLoading || !user) {
    return null;
  }

  const stockName = stock?.name_ko ?? stock?.name_en ?? stockId;
  const currency = stock?.currency ?? "KRW";
  const estimatedAmount = quote ? quote.price * quantity : null;

  const handleConfirmOrder = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setOrderError(null);

    try {
      // execute_order V3 검증 통과를 위해 price_quotes를 미리 갱신
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const quoteRes = await fetch(`/api/quote/${stockId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!quoteRes.ok) {
        setOrderError("시세 갱신에 실패했습니다. 다시 시도해주세요");
        return;
      }

      const { data, error } = await supabase.rpc("execute_order", {
        p_stock_id: stockId,
        p_side: side,
        p_quantity: quantity,
        p_order_type: "market",
      });

      if (error) {
        setOrderError(error.message);
        return;
      }

      const result = (data as OrderResult[] | null)?.[0];

      if (result?.status === "filled") {
        setShowConfirm(false);
        setToast(side === "buy" ? "매수 체결 완료" : "매도 체결 완료");
        setHoldingQty(await fetchHoldingQty(stockId));
        router.refresh();
      } else {
        const reason = result?.reject_reason ?? null;
        setOrderError(
          (reason && REJECT_REASON_MESSAGES[reason]) ??
            reason ??
            "주문이 거부되었습니다"
        );
      }
    } catch {
      setOrderError("네트워크 오류로 주문에 실패했습니다. 다시 시도해주세요");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="mx-auto grid w-full max-w-4xl gap-6 lg:grid-cols-[1fr_320px]">
        {/* 현재가 영역 */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              {stockName}
            </h1>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              지연 시세
            </span>
          </div>

          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {stock?.ticker ?? stockId}
          </p>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("quote")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === "quote"
                  ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              시세
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("chart")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === "chart"
                  ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              차트
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === "history"
                  ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              거래내역
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("info")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === "info"
                  ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              정보
            </button>
          </div>

          {activeTab === "quote" ? (
            <div className="mt-8">
              {quote ? (
                <p className="text-4xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {formatPrice(quote.price, currency)}
                </p>
              ) : (
                <p className="text-4xl font-semibold text-zinc-400 dark:text-zinc-600">
                  -
                </p>
              )}

              {quoteError && (
                <p className="mt-2 text-sm text-red-500">{quoteError}</p>
              )}
            </div>
          ) : activeTab === "chart" ? (
            <div className="mt-8 h-64">
              {candlesLoading && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  불러오는 중...
                </p>
              )}

              {candlesError && (
                <p className="text-sm text-red-500">{candlesError}</p>
              )}

              {!candlesLoading && !candlesError && candles && candles.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={candles}>
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatCandleDate}
                      tick={{ fontSize: 11, fill: "#71717a" }}
                      tickLine={false}
                      axisLine={{ stroke: "#a1a1aa" }}
                      minTickGap={24}
                    />
                    <YAxis
                      domain={["dataMin", "dataMax"]}
                      tick={{ fontSize: 11, fill: "#71717a" }}
                      tickLine={false}
                      axisLine={false}
                      width={60}
                      tickFormatter={(v) => Number(v).toLocaleString()}
                    />
                    <Tooltip
                      formatter={(value) => formatPrice(Number(value), currency)}
                      labelFormatter={(label) => formatCandleDate(String(label))}
                    />
                    <Line
                      type="monotone"
                      dataKey="close"
                      stroke="#71717a"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          ) : activeTab === "history" ? (
            <div className="mt-8">
              {transactionsLoading && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  불러오는 중...
                </p>
              )}

              {transactionsError && (
                <p className="text-sm text-red-500">{transactionsError}</p>
              )}

              {!transactionsLoading &&
                !transactionsError &&
                transactions &&
                transactions.length === 0 && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    거래 내역이 없습니다
                  </p>
                )}

              {!transactionsLoading &&
                !transactionsError &&
                transactions &&
                transactions.length > 0 && (
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {transactions.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between py-3"
                      >
                        <div>
                          <p
                            className={`text-sm font-medium ${
                              t.side === "buy"
                                ? "text-red-500"
                                : "text-blue-500"
                            }`}
                          >
                            {t.side === "buy" ? "매수" : "매도"}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {new Date(t.executed_at).toLocaleString("ko-KR")}
                          </p>
                        </div>
                        <p className="text-sm text-zinc-950 dark:text-zinc-50">
                          {t.quantity}주 · {formatPrice(t.price, t.currency)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          ) : (
            <div className="mt-8 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">종목명</span>
                <span className="text-zinc-950 dark:text-zinc-50">
                  {stockName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">코드</span>
                <span className="text-zinc-950 dark:text-zinc-50">
                  {stock?.ticker ?? "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">통화</span>
                <span className="text-zinc-950 dark:text-zinc-50">
                  {stock?.currency ?? "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">시장</span>
                <span className="text-zinc-950 dark:text-zinc-50">
                  {stock?.market === "KR"
                    ? "국내"
                    : stock?.market === "US"
                      ? "해외"
                      : "-"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 주문 패널 */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              주문
            </h2>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              보유 {holdingQty}주
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              수량
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-950 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />

            <button
              type="button"
              onClick={() => {
                setSide("buy");
                setOrderError(null);
                setShowConfirm(true);
              }}
              disabled={!quote || quantity <= 0}
              className="flex w-full items-center justify-center rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              매수
            </button>

            <button
              type="button"
              onClick={() => {
                setSide("sell");
                setOrderError(null);
                setShowConfirm(true);
              }}
              disabled={!quote || quantity <= 0 || holdingQty <= 0}
              className="flex w-full items-center justify-center rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
            >
              매도
            </button>

            {orderError && !showConfirm && (
              <p className="text-sm text-red-500">{orderError}</p>
            )}
          </div>
        </div>
      </div>

      {/* 확인 모달 */}
      {showConfirm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              {side === "buy" ? "매수 주문 확인" : "매도 주문 확인"}
            </h3>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">종목</span>
                <span className="text-zinc-950 dark:text-zinc-50">{stockName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">수량</span>
                <span className="text-zinc-950 dark:text-zinc-50">{quantity}주</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {side === "buy" ? "예상금액" : "예상 회수금액"}
                </span>
                <span className="text-zinc-950 dark:text-zinc-50">
                  {estimatedAmount !== null
                    ? formatPrice(estimatedAmount, currency)
                    : "-"}
                </span>
              </div>
            </div>

            {side === "sell" && quantity > holdingQty && (
              <p className="mt-4 text-sm text-red-500">
                보유 수량({holdingQty}주)을 초과했습니다
              </p>
            )}

            {orderError && (
              <p className="mt-4 text-sm text-red-500">{orderError}</p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  setOrderError(null);
                }}
                disabled={submitting}
                className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmOrder}
                disabled={
                  submitting || (side === "sell" && quantity > holdingQty)
                }
                className="flex-1 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                {submitting ? "처리 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-green-100 px-4 py-2 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          {toast}
        </div>
      )}
    </div>
  );
}
