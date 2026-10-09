// 계좌 페이지 공유 타입·포매터 (page.tsx에서 분리, 로직 변경 없음)

export type Account = {
  id: string;
  cash_krw: number;
  cash_usd: number;
};

export type Holding = {
  stock_id: string;
  quantity: number;
  avg_price: number;
  currency: string;
  stocks: { name_ko: string | null; name_en: string | null; ticker: string } | null;
  currentPrice: number | null;
};

export type Transaction = {
  id: string;
  stock_id: string;
  side: string;
  quantity: number;
  price: number;
  currency: string;
  executed_at: string;
  stocks: { name_ko: string | null; name_en: string | null } | null;
};

export function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "ko-KR", {
    style: "currency",
    currency,
  }).format(price);
}
