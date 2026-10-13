// execute_order_function.sql의 v_quote_max_age(60초)보다 짧게 잡아, 캐시가
// 서버 측 V3_STALE_QUOTE 판정 전에 갱신되도록 여유를 둔다. 두 값을 바꿀 때는
// 항상 함께 맞춰야 한다.
export const QUOTE_CACHE_TTL_MS = 50_000;

// 국내지수(/api/indices) 서버 캐시 TTL. 홈 폴링 주기도 이 값에 맞춘다 (#108).
// KIS 호출은 사용자 수와 무관하게 TTL당 2건(코스피·코스닥)으로 묶인다.
export const INDEX_CACHE_TTL_SEC = 60;

// KIS 해외 API 권한이 없어(EGW02004) 해외 종목은 시세를 가져올 수 없다(#120).
// 목록에 남겨두면 가격이 "-"로만 보이고, 국내 엔드포인트가 0을 반환해 0원이
// 캐시될 위험도 있으므로 목록·검색에서 숨긴다.
// KIS 해외 신청 + 해외 조회 경로 구현이 끝나면 "US"를 다시 넣으면 된다.
export const SUPPORTED_MARKETS = ["KR"] as const;
