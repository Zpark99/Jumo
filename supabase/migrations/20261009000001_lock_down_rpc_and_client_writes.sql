-- 보안: anon/authenticated에 열려 있던 SECURITY DEFINER RPC·클라이언트 쓰기 권한 회수 (#137)
--
-- 진단 (2026-10-09, 운영 DB 권한 조회로 확인):
--   ① get_kis_token / upsert_kis_token / upsert_price_quote 가 SECURITY DEFINER인데
--      anon·authenticated가 EXECUTE를 갖고 있었다. 브라우저 번들의 anon 키만으로
--      KIS 토큰 조회·덮어쓰기, 임의 시세 기록 후 그 가격에 체결이 가능했다.
--      원인: 20260713000001은 `revoke ... from public`만 했는데, Supabase는 새 함수마다
--      anon·authenticated에 EXECUTE를 "직접" 부여하므로 public 회수로는 지워지지 않는다.
--      (`from public, anon, authenticated`로 명시한 account_total_assets_krw만 막혀 있었다.)
--      → 회수는 항상 세 역할을 명시한다.
--   ② accounts_update_own + 테이블 UPDATE 권한으로 로그인 사용자가 자기 cash_krw·
--      initial_seed_krw를 직접 수정할 수 있었다. 잔고 변경은 execute_order(DEFINER,
--      소유자 postgres)만 하므로 클라이언트 UPDATE 경로는 필요 없다.
--   같은 계열: calculate_season_ranking anon 실행, 수정 UI 없는 posts·comments UPDATE,
--   INSERT 시 created_at 클라이언트 지정(미래 시각으로 최신순 상단 고정 가능).
--
-- ⚠️ 적용 순서: /api/quote가 upsert_price_quote를 supabaseAdmin(service_role)으로
--    호출하도록 바뀐 코드가 운영에 먼저 배포된 뒤 적용한다. 옛 코드(anon 키 호출)가
--    도는 동안 적용하면 시세 캐시가 갱신되지 않아 주문이 V3_STALE_QUOTE로 거부된다.

-- ── ① 서버 전용 RPC: service_role만 실행 ──────────────────────────────────
revoke execute on function public.get_kis_token() from public, anon, authenticated;
revoke execute on function public.upsert_kis_token(text, timestamptz) from public, anon, authenticated;
revoke execute on function public.upsert_price_quote(text, numeric, numeric, numeric) from public, anon, authenticated;

grant execute on function public.get_kis_token() to service_role;
grant execute on function public.upsert_kis_token(text, timestamptz) to service_role;
grant execute on function public.upsert_price_quote(text, numeric, numeric, numeric) to service_role;

-- 랭킹 재계산은 로그인 전용 화면(/ranking)에서만 호출한다
revoke execute on function public.calculate_season_ranking(uuid) from public, anon;

-- ── ② accounts: 클라이언트 직접 수정 금지 ────────────────────────────────
drop policy if exists accounts_update_own on public.accounts;
revoke update on public.accounts from anon, authenticated;

-- ── posts·comments: 수정 기능 없음 → UPDATE 경로 제거 ────────────────────
drop policy if exists posts_update_own on public.posts;
drop policy if exists comments_update_own on public.comments;
revoke update on public.posts, public.comments from anon, authenticated;

-- 작성 시각은 서버가 정한다. 클라이언트가 보낸 created_at·updated_at은 무시.
-- (트리거 함수는 직접 호출할 수 없으므로 EXECUTE 회수는 하지 않는다)
create or replace function public.force_server_timestamps()
returns trigger
language plpgsql
set search_path to public
as $$
begin
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_posts_server_timestamps on public.posts;
create trigger trg_posts_server_timestamps
  before insert on public.posts
  for each row execute function public.force_server_timestamps();

drop trigger if exists trg_comments_server_timestamps on public.comments;
create trigger trg_comments_server_timestamps
  before insert on public.comments
  for each row execute function public.force_server_timestamps();

-- ── SECURITY DEFINER 함수 search_path 고정 확인 ──────────────────────────
-- 2026-10-09 실측 9개 모두 search_path=public으로 이미 고정돼 있어 ALTER는 없다.
-- 고정되지 않은 함수가 있으면 적용을 실패시켜 드러낸다.
do $$
declare
  v_missing text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_missing
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
      where c like 'search_path=%'
    );

  if v_missing is not null then
    raise exception 'search_path가 고정되지 않은 SECURITY DEFINER 함수: %', v_missing;
  end if;
end;
$$;
