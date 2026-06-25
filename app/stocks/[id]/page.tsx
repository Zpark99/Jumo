"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

type Stock = {
  id: string;
  ticker: string;
  name_ko: string | null;
  name_en: string | null;
  currency: string;
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
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!userLoading && !user) {
      router.replace("/login");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    supabase
      .from("stocks")
      .select("id, ticker, name_ko, name_en, currency")
      .eq("id", stockId)
      .single()
      .then(({ data }) => {
        if (data) setStock(data);
      });
  }, [stockId]);

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

  if (userLoading || !user) {
    return null;
  }

  const stockName = stock?.name_ko ?? stock?.name_en ?? stockId;
  const currency = stock?.currency ?? "KRW";
  const estimatedAmount = quote ? quote.price * quantity : null;

  const handleConfirmBuy = async () => {
    setSubmitting(true);
    setOrderError(null);

    const { data, error } = await supabase.rpc("execute_order", {
      p_stock_id: stockId,
      p_side: "buy",
      p_quantity: quantity,
      p_order_type: "market",
    });

    setSubmitting(false);

    if (error) {
      setOrderError(error.message);
      return;
    }

    const result = (data as OrderResult[] | null)?.[0];

    if (result?.status === "filled") {
      setShowConfirm(false);
      setToast("체결 완료");
      router.refresh();
    } else {
      setOrderError(result?.reject_reason ?? "주문이 거부되었습니다");
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
        </div>

        {/* 주문 패널 */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            매수 주문
          </h2>

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
              disabled
              className="flex w-full items-center justify-center rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
            >
              매도 (준비중)
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
              매수 주문 확인
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
                <span className="text-zinc-500 dark:text-zinc-400">예상금액</span>
                <span className="text-zinc-950 dark:text-zinc-50">
                  {estimatedAmount !== null
                    ? formatPrice(estimatedAmount, currency)
                    : "-"}
                </span>
              </div>
            </div>

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
                onClick={handleConfirmBuy}
                disabled={submitting}
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
