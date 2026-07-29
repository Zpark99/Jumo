-- 시즌 랭킹 (#31)
--
-- 설계 결정:
--   - 총자산은 KRW 기준으로만 집계한다 (cash_krw + KRW 보유종목 평가액).
--     fx_rates 테이블이 비어있어 환율 소스가 없고, USD 보유가 현재 0건이라
--     USD 자산을 억지로 고정환율 환산하는 것보다 KRW만 우선 다루는 쪽이 안전하다.
--     USD 자산까지 포함하려면 fx_rates 시딩 + 환산 로직이 별도로 필요하다 (#31-2 후보).
--   - 시세가 없는 종목(price_quotes에 없음)은 평단가(avg_price)로 대체한다.
--     제외하면 매수 직후 시세가 아직 안 잡힌 종목이 자산에서 통째로 빠지는 게 더 부정확하다.
--   - seasons에 is_active를 추가해 "현재 시즌"을 명시적으로 관리한다.
--     기존 시드 데이터("Season 1", 2026-06-21~09-19)는 월별 시즌 설계와 맞지 않아
--     get_or_create_current_season()이 처음 실행되는 시점에 비활성화되고 이번 달
--     시즌으로 교체된다.

-- ── seasons ──────────────────────────────────────────────────────────────
alter table public.seasons
  add column if not exists is_active boolean not null default false;

-- 활성 시즌은 항상 최대 1개만 존재하도록 강제
create unique index if not exists seasons_active_unique
  on public.seasons (is_active)
  where is_active;

-- 월별 시즌은 시작일로 중복 생성을 막는다 (동일 달에 두 번 생성되지 않도록)
create unique index if not exists seasons_start_date_unique
  on public.seasons (start_date);

-- ── rankings ─────────────────────────────────────────────────────────────
alter table public.rankings
  add column if not exists total_asset numeric(20,2);

-- ── RLS: 다른 소셜 기능과 동일하게 로그인 사용자에게만 공개 ───────────────
drop policy if exists "seasons_read_all" on public.seasons;
create policy "seasons_read_all" on public.seasons for select to authenticated using (true);

drop policy if exists "rankings_read_all" on public.rankings;
create policy "rankings_read_all" on public.rankings for select to authenticated using (true);

-- ── 화면 조회용 뷰: rankings + accounts + profiles ──────────────────────
-- security_invoker: 뷰 소유자(postgres)가 아니라 조회하는 사용자 권한으로 RLS를
-- 평가해야 위 authenticated 제한이 실제로 적용된다.
create or replace view public.season_rankings
  with (security_invoker = true) as
select
  r.season_id,
  r.account_id,
  a.user_id,
  p.nickname as user_nickname,
  p.icon as user_icon,
  r.total_asset,
  r.return_rate,
  r.rank,
  r.updated_at
from public.rankings r
join public.accounts a on a.id = r.account_id
join public.profiles p on p.id = a.user_id;

grant select on public.season_rankings to authenticated;

-- ── 현재 활성 시즌 조회/생성 (월별, 매월 1일 시작) ─────────────────────────
create or replace function public.get_or_create_current_season()
returns uuid
language plpgsql
security definer
set search_path to public
as $$
declare
  v_start date := date_trunc('month', current_date)::date;
  v_end   date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_season_id uuid;
begin
  select id into v_season_id from public.seasons where start_date = v_start;

  if v_season_id is null then
    update public.seasons set is_active = false where is_active;
    insert into public.seasons (name, start_date, end_date, is_active)
    values (to_char(v_start, 'YYYY-MM'), v_start, v_end, true)
    returning id into v_season_id;
  elsif not exists (select 1 from public.seasons where id = v_season_id and is_active) then
    update public.seasons set is_active = false where is_active;
    update public.seasons set is_active = true where id = v_season_id;
  end if;

  return v_season_id;
end;
$$;

revoke all on function public.get_or_create_current_season() from public;
grant execute on function public.get_or_create_current_season() to authenticated;

-- ── 랭킹 스냅샷 계산 (수동 트리거) ─────────────────────────────────────────
-- ponytail: 매번 전체 계정 재계산(O(n) 풀스캔). 계정 수가 많아지기 전까지는
-- 충분하고, 자동화(cron)와 남용 방지(rate limit)는 #31-2에서 다룬다.
create or replace function public.calculate_season_ranking(p_season_id uuid)
returns void
language plpgsql
security definer
set search_path to public
as $$
begin
  with asset_totals as (
    select
      a.id as account_id,
      a.cash_krw + coalesce(sum(
        case when h.currency = 'KRW'
          then h.quantity * coalesce(pq.price, h.avg_price)
          else 0
        end
      ), 0) as total_asset,
      a.initial_seed_krw as seed
    from public.accounts a
    left join public.holdings h on h.account_id = a.id
    left join public.price_quotes pq on pq.stock_id = h.stock_id
    group by a.id, a.cash_krw, a.initial_seed_krw
  ),
  ranked as (
    select
      account_id,
      total_asset,
      (total_asset / nullif(seed, 0) - 1) as return_rate,
      rank() over (
        order by (total_asset / nullif(seed, 0)) desc, account_id
      ) as rnk
    from asset_totals
  )
  insert into public.rankings (season_id, account_id, total_asset, return_rate, rank, updated_at)
  select p_season_id, account_id, total_asset, return_rate, rnk, now()
  from ranked
  on conflict (season_id, account_id) do update set
    total_asset = excluded.total_asset,
    return_rate = excluded.return_rate,
    rank        = excluded.rank,
    updated_at  = now();
end;
$$;

revoke all on function public.calculate_season_ranking(uuid) from public;
grant execute on function public.calculate_season_ranking(uuid) to authenticated;
