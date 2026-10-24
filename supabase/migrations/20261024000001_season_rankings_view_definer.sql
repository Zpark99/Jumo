-- season_rankings 뷰: 정의자 권한으로 전환 (#180)
--
-- 진단 (2026-10-24, #178 새 계정으로 운영 확인):
--   뷰가 security_invoker = true로 accounts를 join한다. accounts의 SELECT 정책은
--   본인 행만(auth.uid() = user_id)이라 join 단계에서 타 유저 랭킹 행이 전부
--   걸러진다. rankings 테이블 자체는 authenticated 전체 읽기(rankings_read_all)라
--   정책 의도("로그인 사용자에게 랭킹 공개")와 뷰 동작이 어긋난 상태였다.
--   유저가 1명일 때는 자기 행만 보여서 드러나지 않았다.
--
-- 결정:
--   - accounts RLS는 넓히지 않는다 (타 유저 cash·initial_seed 노출 금지).
--   - 뷰를 정의자(소유자 postgres) 권한으로 재생성한다. 함수로 바꾸는 쪽은 클라이언트
--     3곳(RankingPreview·MyInvestmentCard·/ranking)을 전부 고쳐야 해서 기각.
--   - 노출 컬럼은 랭킹 표시용만: account_id·user_id(내 행 표시용)·닉네임·아이콘·
--     total_asset·return_rate·rank·updated_at. cash·seed 컬럼 없음.
--   - 정의자 뷰는 RLS를 타지 않으므로 뷰 자체 권한으로 접근을 제한한다:
--     anon 전부 회수, authenticated는 SELECT만 (기본 grant로 열려 있던
--     INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER도 회수).

create or replace view public.season_rankings
  with (security_invoker = false) as
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

revoke all on public.season_rankings from public, anon, authenticated;
grant select on public.season_rankings to authenticated;

-- ── 확인: 뷰가 정의자 권한이고 anon 권한이 남아 있지 않은지 ─────────────────
do $$
begin
  if exists (
    select 1 from pg_class c
    where c.oid = 'public.season_rankings'::regclass
      and 'security_invoker=true' = any (c.reloptions)
  ) then
    raise exception 'season_rankings가 여전히 security_invoker=true';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'season_rankings'
      and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type <> 'SELECT'))
  ) then
    raise exception 'season_rankings에 anon 권한 또는 authenticated 비-SELECT 권한이 남아 있음';
  end if;
end $$;
