-- 보안: 소셜 정의자 뷰·RPC 2종의 anon 권한 회수 (#187)
--
-- 진단 (2026-10-25, 07 명세 최종화 중 운영 DB 실측):
--   ① posts_with_author / community_posts / feed_posts 는 security_invoker 미지정
--      (= 정의자 뷰, 소유자 postgres)이라 posts·profiles RLS를 타지 않는데, 뷰 자체
--      권한은 Supabase 기본 grant(anon·authenticated 전 권한) 그대로였다.
--      → posts 테이블은 RLS로 anon 조회가 빈 배열이지만, 뷰는 anon 키만으로 행이 읽혔다.
--      "피드 읽기는 authenticated 전용"(2026-07-20 결정, 20260701000001)이 뷰 경유로는
--      적용되지 않은 상태. 화면은 전부 로그인 가드 뒤에 있어 UI 영향 없음.
--   ② get_or_create_current_season / execute_order 는 `revoke ... from public` 뒤
--      authenticated에만 grant했지만, Supabase가 새 함수마다 anon에 EXECUTE를 직접
--      부여하므로 anon 실행 권한이 남아 있었다 (#137과 같은 원인 — 회수는 세 역할 명시).
--      execute_order는 내부 auth.uid() 검사로 실질 거부되지만 권한 표면은 줄인다.
--
-- 적용 순서: 코드 배포 의존 없음. 모든 호출처가 로그인 사용자(authenticated JWT)라
--   DB 적용만으로 반영된다. 비로그인 화면(홈·/login·/privacy·/stocks 목록)은 이 뷰·함수를
--   쓰지 않는다 (2026-10-25 코드 전수 확인).
--
-- 노출 컬럼 기록: 세 뷰는 posts 컬럼 + profiles.nickname·icon + 반응/댓글 집계만 반환.
--   이메일·avatar_url·bio 등은 없다. 그래도 로그인 전용 설계대로 anon을 막는다.

-- ── ① 소셜 뷰: anon·public 전부 회수, authenticated는 SELECT만 (#180 season_rankings와 동일) ──
revoke all on public.posts_with_author from public, anon, authenticated;
revoke all on public.community_posts   from public, anon, authenticated;
revoke all on public.feed_posts        from public, anon, authenticated;

grant select on public.posts_with_author to authenticated;
grant select on public.community_posts   to authenticated;
grant select on public.feed_posts        to authenticated;

-- ── ② RPC: anon 회수 (authenticated·service_role 유지) ──────────────────────
revoke execute on function public.get_or_create_current_season() from public, anon;
revoke execute on function public.execute_order(text, text, numeric, text, numeric) from public, anon;

-- ── 검증: anon에 남은 권한이 있으면 적용을 실패시킨다 ──────────────────────
do $$
declare
  v_bad text;
begin
  select string_agg(table_name || ':' || privilege_type, ', ')
    into v_bad
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee = 'anon'
    and table_name in ('posts_with_author', 'community_posts', 'feed_posts');
  if v_bad is not null then
    raise exception 'anon 뷰 권한 잔존: %', v_bad;
  end if;

  select string_agg(p.oid::regprocedure::text, ', ')
    into v_bad
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('get_or_create_current_season', 'execute_order')
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_bad is not null then
    raise exception 'anon EXECUTE 잔존: %', v_bad;
  end if;
end;
$$;
