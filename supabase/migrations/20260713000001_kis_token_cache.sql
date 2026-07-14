-- =============================================================================
-- KIS 접근토큰 지속 캐싱 (#17)
-- -----------------------------------------------------------------------------
-- 기존에는 route.ts 프로세스 메모리(cachedToken)에만 KIS 토큰을 캐싱해서
-- dev 재시작/Vercel serverless 인스턴스마다 캐시가 소실 -> 토큰 과다 재발급 ->
-- KIS 레이트리밋을 유발했다. 토큰을 DB에 만료시각과 함께 저장해 재사용한다.
--
-- 보안: kis_tokens.access_token은 그 자체로 민감한 비밀값이므로
--   - RLS를 활성화하되 anon/authenticated용 정책은 만들지 않는다(전원 차단).
--   - get_kis_token/upsert_kis_token은 SECURITY DEFINER로 RLS를 우회하지만,
--     EXECUTE 권한 자체를 service_role에만 GRANT한다(anon/authenticated로
--     GRANT하면 브라우저에 노출된 NEXT_PUBLIC_SUPABASE_ANON_KEY로 누구나
--     PostgREST RPC 엔드포인트를 호출해 토큰을 그대로 빼갈 수 있다).
--   - API 라우트는 SUPABASE_SERVICE_ROLE_KEY로 만든 서버 전용 클라이언트로만
--     이 RPC들을 호출한다.
-- =============================================================================

create table if not exists public.kis_tokens (
  id smallint primary key default 1,
  access_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint kis_tokens_single_row check (id = 1)
);

alter table public.kis_tokens enable row level security;
-- 의도적으로 정책을 만들지 않는다: anon/authenticated는 직접 접근 불가.

-- 만료 5분 전까지만 "유효"로 간주해 반환한다(임박 시 미리 갱신하도록 유도).
create or replace function public.get_kis_token()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select access_token
  from public.kis_tokens
  where id = 1
    and expires_at > (now() + interval '5 minutes')
  limit 1;
$$;

create or replace function public.upsert_kis_token(p_token text, p_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.kis_tokens (id, access_token, expires_at, updated_at)
  values (1, p_token, p_expires_at, now())
  on conflict (id) do update
    set access_token = excluded.access_token,
        expires_at = excluded.expires_at,
        updated_at = now();
end;
$$;

revoke all on public.kis_tokens from public, anon, authenticated;

revoke all on function public.get_kis_token() from public;
revoke all on function public.upsert_kis_token(text, timestamptz) from public;

grant execute on function public.get_kis_token() to service_role;
grant execute on function public.upsert_kis_token(text, timestamptz) to service_role;
