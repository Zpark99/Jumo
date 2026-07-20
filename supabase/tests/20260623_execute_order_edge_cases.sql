-- =============================================================================
-- execute_order 엣지케이스 테스트 (실제 원격 스키마 기준)
-- -----------------------------------------------------------------------------
-- 실행: npx supabase db query --linked -f supabase/tests/20260623_execute_order_edge_cases.sql
-- 전체를 트랜잭션으로 감싸고 끝에 ROLLBACK 하므로, 실행 후 DB 상태에는
-- 아무런 흔적도 남지 않는다(반복 실행 가능).
--
-- public.handle_new_user 트리거가 auth.users insert 시 profiles + accounts
-- (시드머니 cash_krw=10,000,000 / cash_usd=10,000) 행을 자동 생성하므로,
-- accounts를 직접 insert하지 않고 트리거가 만든 행을 찾아 cash_krw만 조정한다.
--
-- auth.uid()를 흉내내기 위해 request.jwt.claims 세션 설정을 사용한다(Supabase
-- 표준 auth.uid() 구현이 이 설정의 sub 클레임을 읽는 방식에 기반).
-- =============================================================================

begin;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_account_id uuid;
  v_stock_id text := 'TEST001';
  v_result record;
begin
  -- ---- 픽스처: 인증 사용자 (트리거가 profiles + accounts 자동 생성) ----
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'edge-case-test@example.com', 'x', now(), now(), now(), '{}', '{}'
  );

  select id into v_account_id from public.accounts where user_id = v_user_id;

  -- 10주 * 10,000원 = 100,000원에서 1원 부족하게 세팅
  update public.accounts set cash_krw = 99999 where id = v_account_id;

  insert into public.stocks (id, ticker, market, currency, name_ko)
  values (v_stock_id, 'TEST001', 'KR', 'KRW', '테스트전자');

  insert into public.price_quotes (stock_id, price, fetched_at)
  values (v_stock_id, 10000, now());

  -- 이 트랜잭션 동안 auth.uid()가 테스트 유저를 가리키도록 설정
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_id)::text, true);

  -- ---------------------------------------------------------------------
  -- 케이스 1: 잔고 1원 부족 -> rejected (V5_INSUFFICIENT_CASH)
  -- ---------------------------------------------------------------------
  select * into v_result from public.execute_order(v_stock_id, 'buy', 10, 'market');

  if v_result.status is distinct from 'rejected'
     or v_result.reject_reason is distinct from 'V5_INSUFFICIENT_CASH' then
    raise exception '[FAIL] 케이스1 잔고1원부족: status=%, reason=%', v_result.status, v_result.reject_reason;
  end if;
  raise notice '[PASS] 케이스1 잔고 1원 부족 -> rejected(V5_INSUFFICIENT_CASH)';

  -- ---------------------------------------------------------------------
  -- 케이스 2: 0주 매도 -> rejected (V1_INVALID_QUANTITY)
  -- ---------------------------------------------------------------------
  select * into v_result from public.execute_order(v_stock_id, 'sell', 0, 'market');

  if v_result.status is distinct from 'rejected'
     or v_result.reject_reason is distinct from 'V1_INVALID_QUANTITY' then
    raise exception '[FAIL] 케이스2 0주매도: status=%, reason=%', v_result.status, v_result.reject_reason;
  end if;
  raise notice '[PASS] 케이스2 0주 매도 -> rejected(V1_INVALID_QUANTITY)';

  -- ---------------------------------------------------------------------
  -- 케이스 3: 전량 매도 -> filled, holdings 행 삭제
  -- ---------------------------------------------------------------------
  update public.accounts set cash_krw = 1000000 where id = v_account_id;

  -- 사전 매수로 5주 적립
  select * into v_result from public.execute_order(v_stock_id, 'buy', 5, 'market');
  if v_result.status is distinct from 'filled' then
    raise exception '[FAIL] 케이스3 사전 매수 실패: status=%, reason=%', v_result.status, v_result.reject_reason;
  end if;

  -- 보유 전량 매도
  select * into v_result from public.execute_order(v_stock_id, 'sell', 5, 'market');
  if v_result.status is distinct from 'filled' then
    raise exception '[FAIL] 케이스3 전량 매도 실패: status=%, reason=%', v_result.status, v_result.reject_reason;
  end if;

  if exists (
    select 1 from public.holdings
    where account_id = v_account_id and stock_id = v_stock_id
  ) then
    raise exception '[FAIL] 케이스3 전량매도 후에도 holdings 행이 남아있음';
  end if;
  raise notice '[PASS] 케이스3 전량 매도 -> filled, holdings 행 삭제됨';

  -- ---------------------------------------------------------------------
  -- V6 케이스 준비: 별도 종목(TEST002)으로 보유 0/1/2주 경계를 검증
  -- ---------------------------------------------------------------------
  insert into public.stocks (id, ticker, market, currency, name_ko)
  values ('TEST002', 'TEST002', 'KR', 'KRW', '테스트전자2');

  insert into public.price_quotes (stock_id, price, fetched_at)
  values ('TEST002', 10000, now());

  -- ---------------------------------------------------------------------
  -- 케이스 4: 보유 0주 상태에서 1주 매도 -> rejected (V6_INSUFFICIENT_HOLDINGS)
  -- ---------------------------------------------------------------------
  select * into v_result from public.execute_order('TEST002', 'sell', 1, 'market');

  if v_result.status is distinct from 'rejected'
     or v_result.reject_reason is distinct from 'V6_INSUFFICIENT_HOLDINGS' then
    raise exception '[FAIL] 케이스4 보유0주매도: status=%, reason=%', v_result.status, v_result.reject_reason;
  end if;
  raise notice '[PASS] 케이스4 보유 0주 상태에서 1주 매도 -> rejected(V6_INSUFFICIENT_HOLDINGS)';

  -- ---------------------------------------------------------------------
  -- 케이스 5: 보유 1주 상태에서 2주 매도 -> rejected (V6_INSUFFICIENT_HOLDINGS)
  -- ---------------------------------------------------------------------
  select * into v_result from public.execute_order('TEST002', 'buy', 1, 'market');
  if v_result.status is distinct from 'filled' then
    raise exception '[FAIL] 케이스5 사전 매수 실패: status=%, reason=%', v_result.status, v_result.reject_reason;
  end if;

  select * into v_result from public.execute_order('TEST002', 'sell', 2, 'market');

  if v_result.status is distinct from 'rejected'
     or v_result.reject_reason is distinct from 'V6_INSUFFICIENT_HOLDINGS' then
    raise exception '[FAIL] 케이스5 보유1주초과매도: status=%, reason=%', v_result.status, v_result.reject_reason;
  end if;
  raise notice '[PASS] 케이스5 보유 1주 상태에서 2주 매도 -> rejected(V6_INSUFFICIENT_HOLDINGS)';

  -- ---------------------------------------------------------------------
  -- 케이스 6: 보유 2주 상태에서 2주 매도(전량) -> filled, holdings 행 삭제
  -- ---------------------------------------------------------------------
  select * into v_result from public.execute_order('TEST002', 'buy', 1, 'market');
  if v_result.status is distinct from 'filled' then
    raise exception '[FAIL] 케이스6 추가매수 실패: status=%, reason=%', v_result.status, v_result.reject_reason;
  end if;

  select * into v_result from public.execute_order('TEST002', 'sell', 2, 'market');
  if v_result.status is distinct from 'filled' then
    raise exception '[FAIL] 케이스6 전량매도 실패: status=%, reason=%', v_result.status, v_result.reject_reason;
  end if;

  if exists (
    select 1 from public.holdings
    where account_id = v_account_id and stock_id = 'TEST002'
  ) then
    raise exception '[FAIL] 케이스6 전량매도 후에도 holdings 행이 남아있음';
  end if;
  raise notice '[PASS] 케이스6 보유 2주 상태에서 2주 매도(전량) -> filled, holdings 행 삭제됨';

  -- ---------------------------------------------------------------------
  -- 케이스 7: 매도 수량 음수(-1) -> rejected (V1_INVALID_QUANTITY)
  -- (0주 매도는 케이스2에서 이미 검증됨; V1 검증이 V6보다 먼저 수행되므로
  --  보유 여부와 무관하게 V1이 우선 발생한다)
  -- ---------------------------------------------------------------------
  select * into v_result from public.execute_order('TEST002', 'sell', -1, 'market');

  if v_result.status is distinct from 'rejected'
     or v_result.reject_reason is distinct from 'V1_INVALID_QUANTITY' then
    raise exception '[FAIL] 케이스7 음수매도: status=%, reason=%', v_result.status, v_result.reject_reason;
  end if;
  raise notice '[PASS] 케이스7 매도 수량 음수(-1) -> rejected(V1_INVALID_QUANTITY)';

  raise notice '모든 엣지케이스 테스트 통과';
end;
$$;

rollback;
