// 종목 상세 페이지 공유 타입·포매터 (page.tsx에서 분리, 로직 변경 없음)

export type TabKey =
  | "quote"
  | "chart"
  | "orderbook"
  | "news"
  | "history"
  | "community"
  | "info";

export type Stock = {
  id: string;
  ticker: string;
  name_ko: string | null;
  name_en: string | null;
  currency: string;
  market: string;
};

export type Transaction = {
  id: string;
  side: string;
  quantity: number;
  price: number;
  currency: string;
  executed_at: string;
};

export type Quote = {
  stock_id: string;
  price: number;
  prev_close: number | null;
  change_rate: number | null;
  fetched_at: string;
};

export type OrderResult = {
  order_id: string | null;
  status: string;
  executed_price: number | null;
  executed_quantity: number | null;
  reject_reason: string | null;
};

export function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "ko-KR", {
    style: "currency",
    currency,
  }).format(price);
}

// KIS 응답 날짜(YYYYMMDD) -> "MM/DD" 축 라벨
export function formatCandleDate(date: string) {
  return `${date.slice(4, 6)}/${date.slice(6, 8)}`;
}
