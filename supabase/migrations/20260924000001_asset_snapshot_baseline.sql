-- 시즌 기준 자산 자동 스냅샷 인프라 (#47, #67 선행)
--
-- 설계 결정:
--   - 기준 자산은 001에서 만들어두고 쓰지 않던 asset_snapshots 테이블에
--     (account_id, snapshot_date[KST]) 단위로 기록한다. season_id로 묶지 않는 이유:
--     시즌 행은 get_or_create_current_season()이 조회 시점에 lazy 생성하고 UTC
--     current_date 기준이라, 00:00 KST(=전날 15:00 UTC)에 도는 cron이 시즌 id를
--     잡으면 직전 시즌을 가리킨다. 날짜로 기록하면 시즌 정의(월→분기, #67 2/4)와
--     무관하게 동작한다.
--   - 시즌 기준 자산 = 시즌 기간 안에서 가장 이른 스냅샷 (조회/계산식은 #67 2/4).
--       기존 유저  : 분기 첫날 00:00 KST cron 스냅샷
--       중간 가입자: 계좌 생성 시점 스냅샷 (트리거)
--   - 한 번 기록된 스냅샷은 덮어쓰지 않는다(on conflict do nothing).
--     cron을 재실행하거나 가입과 겹쳐도 기준점이 바뀌지 않는다.
--   - 총자산 공식은 calculate_season_ranking과 동일(KRW만, 시세 없으면 평단가).
--     기준 자산과 현재 자산의 공식이 다르면 수익률이 틀어지므로 함수로 분리했고,
--     calculate_season_ranking은 #67 2/4에서 이 함수를 쓰도록 바꾼다.

-- ── pg_cron (Supabase 권장 설치 방식) ─────────────────────────────────────
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- ── 계좌별 총자산(KRW) ───────────────────────────────────────────────────
create or replace function public.account_total_assets_krw()
returns table (account_id uuid, total_asset numeric)
language sql
stable
set search_path to public
as $$
  select
    a.id,
    a.cash_krw + coalesce(sum(
      case when h.currency = 'KRW'
        then h.quantity * coalesce(pq.price, h.avg_price)
        else 0
      end
    ), 0)
  from public.accounts a
  left join public.holdings h on h.account_id = a.id
  left join public.price_quotes pq on pq.stock_id = h.stock_id
  group by a.id, a.cash_krw;
$$;

revoke all on function public.account_total_assets_krw() from public, anon, authenticated;

-- ── 전체 계좌 스냅샷 (cron 전용) ─────────────────────────────────────────
-- 반환값: 새로 기록된 행 수 (이미 오늘자 스냅샷이 있는 계좌는 건너뜀)
create or replace function public.capture_asset_snapshots()
returns integer
language sql
set search_path to public
as $$
  with inserted as (
    insert into public.asset_snapshots
      (account_id, snapshot_date, total_value_krw, pnl_krw, return_rate)
    select
      t.account_id,
      (now() at time zone 'Asia/Seoul')::date,
      t.total_asset,
      t.total_asset - a.initial_seed_krw,
      coalesce(t.total_asset / nullif(a.initial_seed_krw, 0) - 1, 0)
    from public.account_total_assets_krw() t
    join public.accounts a on a.id = t.account_id
    on conflict (account_id, snapshot_date) do nothing
    returning 1
  )
  select count(*)::integer from inserted;
$$;

revoke all on function public.capture_asset_snapshots() from public, anon, authenticated;

-- ── 계좌 생성 시점 스냅샷 (중간 가입자 기준점) ──────────────────────────
-- handle_new_user → accounts insert 안에서 실행된다. 여기서 에러가 나면 가입
-- 자체가 롤백되므로 단순 insert 하나만 둔다. 신규 계좌는 보유 종목이 없어
-- 총자산 = 현금.
create or replace function public.snapshot_new_account()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
begin
  insert into public.asset_snapshots
    (account_id, snapshot_date, total_value_krw, pnl_krw, return_rate)
  values (
    new.id,
    (now() at time zone 'Asia/Seoul')::date,
    new.cash_krw,
    new.cash_krw - new.initial_seed_krw,
    coalesce(new.cash_krw / nullif(new.initial_seed_krw, 0) - 1, 0)
  )
  on conflict (account_id, snapshot_date) do nothing;
  return new;
end;
$$;

revoke all on function public.snapshot_new_account() from public, anon, authenticated;

drop trigger if exists trg_accounts_snapshot_on_create on public.accounts;
create trigger trg_accounts_snapshot_on_create
  after insert on public.accounts
  for each row execute function public.snapshot_new_account();

-- ── 분기 첫날 00:00 KST 자동 실행 ────────────────────────────────────────
-- pg_cron은 GMT 기준. 분기 첫날 00:00 KST = 3·6·9·12월 말일($) 15:00 UTC.
-- 같은 이름으로 다시 schedule하면 기존 잡을 덮어쓴다(재실행 안전).
select cron.schedule(
  'capture-asset-snapshots-quarterly',
  '0 15 $ 3,6,9,12 *',
  $$select public.capture_asset_snapshots()$$
);
