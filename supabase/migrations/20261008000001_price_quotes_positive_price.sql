-- =============================================================================
-- price_quotes.price > 0 제약 (#120)
--
-- 배경:
--   해외 종목 코드를 KIS 국내 엔드포인트에 넘기면 rt_cd=0(정상)에 현재가 0이
--   돌아온다. 이 0이 price_quotes에 저장되면 execute_order가 체결가로 그대로
--   사용해(시세 존재·신선도만 검증하고 가격 범위는 보지 않음) 0원 체결이
--   발생한다 → 무상 취득 → 랭킹 왜곡.
--
-- 왜 제약인가:
--   price_quotes에 쓰는 경로가 여럿(upsert_price_quote RPC, 향후 배치/실시간)이라
--   호출부마다 막는 대신 모든 writer가 수렴하는 데이터 계층에서 한 번에 막는다.
--   execute_order는 price_quotes만 읽으므로, 0 이하 행이 존재할 수 없게 되면
--   0원 체결 경로 자체가 사라진다(함수 본문 수정 불필요).
--
-- 적용 전 확인: 기존 행 전부 양수(1687000 / 264500 / 33600) — 위반 데이터 없음.
-- =============================================================================

alter table public.price_quotes
  add constraint price_quotes_price_positive check (price > 0);

comment on constraint price_quotes_price_positive on public.price_quotes is
  '0 이하 시세 저장 차단. 해외 종목이 국내 엔드포인트에서 0을 반환해 0원 체결로 이어지던 문제(#120) 방지.';
