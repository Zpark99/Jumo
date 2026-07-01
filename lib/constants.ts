// execute_order_function.sql의 v_quote_max_age(60초)보다 짧게 잡아, 캐시가
// 서버 측 V3_STALE_QUOTE 판정 전에 갱신되도록 여유를 둔다. 두 값을 바꿀 때는
// 항상 함께 맞춰야 한다.
export const QUOTE_CACHE_TTL_MS = 50_000;
