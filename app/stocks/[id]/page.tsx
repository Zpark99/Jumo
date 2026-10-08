"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import type { Candle, CandlePeriod } from "@/app/api/candles/[stockId]/route";
import StockHeader from "./StockHeader";
import StockTabs from "./StockTabs";
import OrderPanel from "./OrderPanel";
import ConfirmModal from "./ConfirmModal";
import type {
  OrderResult,
  Quote,
  Stock,
  TabKey,
  Transaction,
} from "./types";

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

  const [activeTab, setActiveTab] = useState<TabKey>("quote");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [candlesError, setCandlesError] = useState<string | null>(null);
  const [candlePeriod, setCandlePeriod] = useState<CandlePeriod>("D");

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
        const res = await fetch(`/api/candles/${stockId}?period=${candlePeriod}`);
        if (!active) return;

        if (!res.ok) {
          setCandlesError("차트 데이터를 불러오지 못했습니다");
          return;
        }

        const data: { candles: Candle[] } = await res.json();
        setCandles(data.candles);
      } catch {
        if (active) setCandlesError("차트 데이터를 불러오지 못했습니다");
      } finally {
        if (active) setCandlesLoading(false);
      }
    }

    loadCandles();
    return () => {
      active = false;
    };
    // candlePeriod 변경 시에는 아래 핸들러가 candles를 null로 되돌려 재조회된다
  }, [activeTab, candles, stockId, candlePeriod]);

  // 기간 전환: candles를 비워 위 effect의 "null이면 조회" 경로를 그대로 태운다
  const changeCandlePeriod = (next: CandlePeriod) => {
    if (next === candlePeriod) return;
    setCandlePeriod(next);
    setCandles(null);
  };

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
    <div className="flex flex-1 flex-col bg-page px-6 py-10">
      <div className="mx-auto grid w-full max-w-4xl gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <StockHeader
            stockName={stockName}
            ticker={stock?.ticker ?? stockId}
            quote={quote}
            currency={currency}
            quoteError={quoteError}
          />
          <StockTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            stock={stock}
            stockName={stockName}
            stockId={stockId}
            currency={currency}
            userId={user.id}
            quote={quote}
            candles={candles}
            candlesLoading={candlesLoading}
            candlesError={candlesError}
            candlePeriod={candlePeriod}
            onCandlePeriodChange={changeCandlePeriod}
            transactions={transactions}
            transactionsLoading={transactionsLoading}
            transactionsError={transactionsError}
          />
        </div>

        <OrderPanel
          holdingQty={holdingQty}
          quantity={quantity}
          setQuantity={setQuantity}
          quote={quote}
          showConfirm={showConfirm}
          orderError={orderError}
          onBuy={() => {
            setSide("buy");
            setOrderError(null);
            setShowConfirm(true);
          }}
          onSell={() => {
            setSide("sell");
            setOrderError(null);
            setShowConfirm(true);
          }}
        />
      </div>

      {showConfirm && (
        <ConfirmModal
          side={side}
          stockName={stockName}
          quantity={quantity}
          estimatedAmount={estimatedAmount}
          currency={currency}
          holdingQty={holdingQty}
          orderError={orderError}
          submitting={submitting}
          onCancel={() => {
            setShowConfirm(false);
            setOrderError(null);
          }}
          onConfirm={handleConfirmOrder}
        />
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
