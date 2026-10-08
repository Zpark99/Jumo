import PostFeed from "@/components/PostFeed";
import type { Candle, CandlePeriod } from "@/app/api/candles/[stockId]/route";
import CandleChart from "./CandleChart";
import type { OrderBookData } from "@/app/api/orderbook/[stockId]/route";
import OrderBook from "./OrderBook";
import StockNews, { buildMockNews } from "./StockNews";
import {
  formatPrice,
  type Quote,
  type Stock,
  type TabKey,
  type Transaction,
} from "./types";

// R3: 탭 키 literal 고정. page.tsx의 lazy load effect 조건(chart/history)과 일치해야 함 — 절대 변경 금지.
// orderbook은 목업이라 lazy load effect 없음(탭 전환만).
const TABS: { key: TabKey; label: string }[] = [
  { key: "quote", label: "시세" },
  { key: "chart", label: "차트" },
  { key: "orderbook", label: "호가" },
  { key: "news", label: "뉴스" },
  { key: "history", label: "거래내역" },
  { key: "community", label: "커뮤니티" },
  { key: "info", label: "정보" },
];

const PERIODS: { key: CandlePeriod; label: string }[] = [
  { key: "D", label: "일" },
  { key: "W", label: "주" },
  { key: "M", label: "월" },
];

type Props = {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  stock: Stock | null;
  stockName: string;
  stockId: string;
  currency: string;
  userId: string;
  quote: Quote | null;
  candles: Candle[] | null;
  candlesLoading: boolean;
  candlesError: string | null;
  candlePeriod: CandlePeriod;
  onCandlePeriodChange: (period: CandlePeriod) => void;
  orderbook: OrderBookData | null;
  orderbookError: string | null;
  transactions: Transaction[] | null;
  transactionsLoading: boolean;
  transactionsError: string | null;
};

export default function StockTabs({
  activeTab,
  onTabChange,
  stock,
  stockName,
  stockId,
  currency,
  userId,
  quote,
  candles,
  candlesLoading,
  candlesError,
  candlePeriod,
  onCandlePeriodChange,
  orderbook,
  orderbookError,
  transactions,
  transactionsLoading,
  transactionsError,
}: Props) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === key
                ? "bg-brand text-white"
                : "bg-surface text-fg-secondary hover:bg-border"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "quote" ? (
        <dl className="mt-8 space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-secondary">현재가</dt>
            <dd className="text-fg-primary">
              {quote ? formatPrice(quote.price, currency) : "-"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-secondary">전일 종가</dt>
            <dd className="text-fg-primary">
              {quote && quote.prev_close !== null
                ? formatPrice(quote.prev_close, currency)
                : "-"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-secondary">등락률</dt>
            <dd className="text-fg-primary">
              {quote && quote.change_rate !== null
                ? `${quote.change_rate > 0 ? "+" : ""}${quote.change_rate.toFixed(2)}%`
                : "-"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-secondary">갱신 시각</dt>
            <dd className="text-fg-primary">
              {quote
                ? new Date(quote.fetched_at).toLocaleTimeString("ko-KR")
                : "-"}
            </dd>
          </div>
        </dl>
      ) : activeTab === "chart" ? (
        <div className="mt-8">
          {/* 기간 전환 (일/주/월). 분봉은 1회 30건 제한 때문에 별도 작업 */}
          <div className="mb-3 inline-flex rounded-full bg-surface p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => onCandlePeriodChange(p.key)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                  candlePeriod === p.key
                    ? "bg-brand text-white"
                    : "text-fg-secondary hover:text-fg-primary"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="h-64">
            {candlesLoading && (
              <p className="text-sm text-fg-secondary">불러오는 중...</p>
            )}

            {candlesError && <p className="text-sm text-red-500">{candlesError}</p>}

            {!candlesLoading && !candlesError && candles && candles.length > 0 && (
              <CandleChart candles={candles} currency={currency} />
            )}
          </div>
        </div>
      ) : activeTab === "orderbook" ? (
        orderbookError ? (
          <p className="mt-8 text-sm text-red-500">{orderbookError}</p>
        ) : orderbook ? (
          <OrderBook
            asks={orderbook.asks}
            bids={orderbook.bids}
            currentPrice={quote?.price ?? null}
            currency={currency}
          />
        ) : (
          <p className="mt-8 text-sm text-fg-secondary">
            호가 정보를 불러오는 중...
          </p>
        )
      ) : activeTab === "news" ? (
        <StockNews items={buildMockNews(stockName)} />
      ) : activeTab === "history" ? (
        <div className="mt-8">
          {transactionsLoading && (
            <p className="text-sm text-fg-secondary">불러오는 중...</p>
          )}

          {transactionsError && (
            <p className="text-sm text-red-500">{transactionsError}</p>
          )}

          {!transactionsLoading &&
            !transactionsError &&
            transactions &&
            transactions.length === 0 && (
              <p className="text-sm text-fg-secondary">거래 내역이 없습니다</p>
            )}

          {!transactionsLoading &&
            !transactionsError &&
            transactions &&
            transactions.length > 0 && (
              <ul className="divide-y divide-border">
                {transactions.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div>
                      {/* 거래 방향(등락 아님): 매수=빨강 / 매도=파랑, 한국 증권 관행 */}
                      <p
                        className={`text-sm font-medium ${
                          t.side === "buy" ? "text-price-up" : "text-price-down"
                        }`}
                      >
                        {t.side === "buy" ? "매수" : "매도"}
                      </p>
                      <p className="text-xs text-fg-secondary">
                        {new Date(t.executed_at).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    <p className="text-sm text-fg-primary">
                      {t.quantity}주 · {formatPrice(t.price, t.currency)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
        </div>
      ) : activeTab === "community" ? (
        <div className="mt-8">
          <PostFeed
            userId={userId}
            table="community_posts"
            stockId={stockId}
            composePlaceholder={`${stockName}에 대한 생각을 남겨보세요`}
            emptyMessage="이 종목의 첫 글을 남겨보세요"
          />
        </div>
      ) : (
        <div className="mt-8 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-fg-secondary">종목명</span>
            <span className="text-fg-primary">{stockName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-secondary">코드</span>
            <span className="text-fg-primary">{stock?.ticker ?? "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-secondary">통화</span>
            <span className="text-fg-primary">{stock?.currency ?? "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-secondary">시장</span>
            <span className="text-fg-primary">
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
  );
}
