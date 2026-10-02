-- =============================================================================
-- 시즌 기준 자산 스냅샷 테스트 (#47)
-- -----------------------------------------------------------------------------
-- 실행: npx supabase db query --linked -f supabase/tests/20260924_asset_snapshot_baseline.sql
-- 전체를 트랜잭션으로 감싸고 끝에 ROLLBACK 하므로 DB에 흔적이 남지 않는다.
-- (capture_asset_snapshots()는 실제 계좌에도 행을 쓰지만 함께 롤백된다)
-- =============================================================================

begin;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_account_id uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_snap public.asset_snapshots%rowtype;
  v_inserted integer;
begin
  -- ---- 픽스처: 가입 (handle_new_user 트리거가 profiles + accounts 생성) ----
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'snapshot-test@example.com', 'x', now(), now(), now(), '{}', '{}'
  );

  select id into v_account_id from public.accounts where user_id = v_user_id;

  -- ---------------------------------------------------------------------
  -- 케이스 1: 가입 시점 스냅샷이 자동 기록된다 (중간 가입자 기준점)
  -- ---------------------------------------------------------------------
  select * into v_snap from public.asset_snapshots
  where account_id = v_account_id and snapshot_date = v_today;

  if v_snap.id is null or v_snap.total_value_krw <> 10000000
     or v_snap.pnl_krw <> 0 or v_snap.return_rate <> 0 then
    raise exception '[FAIL] 케이스1 가입 스냅샷: %', row_to_json(v_snap);
  end if;
  raise notice '[PASS] 케이스1 가입 시점 스냅샷 기록 (10,000,000 / pnl 0 / 0%%, 날짜 %)', v_today;

  -- ---- 픽스처: 보유 종목 (시세 있음 / 시세 없음 / USD) ----
  insert into public.stocks (id, ticker, market, currency, name_ko) values
    ('SNAPT01', 'SNAPT01', 'KR', 'KRW', '스냅샷테스트1'),
    ('SNAPT02', 'SNAPT02', 'KR', 'KRW', '스냅샷테스트2'),
    ('SNAPT03', 'SNAPT03', 'US', 'USD', 'snapshot test 3');

  insert into public.price_quotes (stock_id, price, fetched_at)
  values ('SNAPT01', 15000, now());

  insert into public.holdings (account_id, stock_id, quantity, avg_price, currency) values
    (v_account_id, 'SNAPT01', 10, 10000, 'KRW'),  -- 시세 15,000 × 10 = 150,000
    (v_account_id, 'SNAPT02', 5, 20000, 'KRW'),   -- 시세 없음 → 평단 20,000 × 5 = 100,000
    (v_account_id, 'SNAPT03', 3, 100, 'USD');     -- USD는 집계 제외

  update public.accounts set cash_krw = 9000000 where id = v_account_id;
  -- 기대 총자산: 9,000,000 + 150,000 + 100,000 = 9,250,000

  -- ---------------------------------------------------------------------
  -- 케이스 2: 같은 날 cron 재실행 → 기준점 덮어쓰지 않음
  -- ---------------------------------------------------------------------
  perform public.capture_asset_snapshots();

  select * into v_snap from public.asset_snapshots
  where account_id = v_account_id and snapshot_date = v_today;

  if v_snap.total_value_krw <> 10000000 then
    raise exception '[FAIL] 케이스2 기준점이 덮어써짐: %', v_snap.total_value_krw;
  end if;
  raise notice '[PASS] 케이스2 같은 날 재실행해도 기준점 불변 (10,000,000 유지)';

  -- ---------------------------------------------------------------------
  -- 케이스 3: 스냅샷이 없는 계좌는 현재 총자산으로 기록 (시세/평단/USD 제외)
  -- ---------------------------------------------------------------------
  delete from public.asset_snapshots where account_id = v_account_id;

  v_inserted := public.capture_asset_snapshots();

  select * into v_snap from public.asset_snapshots
  where account_id = v_account_id and snapshot_date = v_today;

  if v_inserted < 1 or v_snap.total_value_krw <> 9250000
     or v_snap.pnl_krw <> -750000 or v_snap.return_rate <> -0.075 then
    raise exception '[FAIL] 케이스3 총자산 계산: inserted=%, %', v_inserted, row_to_json(v_snap);
  end if;
  raise notice '[PASS] 케이스3 총자산 9,250,000 / pnl -750,000 / -7.5%% (inserted=%)', v_inserted;

  -- ---------------------------------------------------------------------
  -- 케이스 4: 일반 사용자는 스냅샷 함수를 호출할 수 없다
  -- ---------------------------------------------------------------------
  if has_function_privilege('authenticated', 'public.capture_asset_snapshots()', 'execute')
     or has_function_privilege('anon', 'public.capture_asset_snapshots()', 'execute')
     or has_function_privilege('authenticated', 'public.account_total_assets_krw()', 'execute') then
    raise exception '[FAIL] 케이스4 anon/authenticated에 execute 권한이 남아있음';
  end if;
  raise notice '[PASS] 케이스4 anon/authenticated execute 권한 없음';

  -- ---------------------------------------------------------------------
  -- 케이스 5: cron 잡 등록 (매일 00:00 KST = 15:00 UTC), 스냅샷 잡은 1개뿐
  -- ---------------------------------------------------------------------
  if not exists (
    select 1 from cron.job
    where jobname = 'capture-asset-snapshots-daily'
      and schedule = '0 15 * * *'
      and command = 'select public.capture_asset_snapshots()'
      and active
  ) or (
    select count(*) from cron.job
    where command = 'select public.capture_asset_snapshots()'
  ) <> 1 then
    raise exception '[FAIL] 케이스5 cron 잡 미등록/불일치/중복';
  end if;
  raise notice '[PASS] 케이스5 cron 잡 등록 확인 (0 15 * * *, 중복 없음)';

  raise notice '모든 스냅샷 테스트 통과';
end;
$$;

rollback;
