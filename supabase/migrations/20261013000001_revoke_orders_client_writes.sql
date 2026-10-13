-- orders: 클라이언트 쓰기 경로 제거 (#142)
--
-- 주문 기록은 execute_order(SECURITY DEFINER, 소유자 postgres)만 쓴다.
-- 클라이언트 코드의 orders 직접 INSERT/UPDATE 사용처는 0곳 (2026-10-13 확인).
-- execute_order는 테이블 소유자 권한으로 실행되므로 아래 회수의 영향을 받지 않는다.
-- 회수는 anon·authenticated를 명시한다 (20261009000001 참고).

drop policy if exists orders_insert_own on public.orders;
drop policy if exists orders_update_own on public.orders;
revoke insert, update on public.orders from anon, authenticated;
