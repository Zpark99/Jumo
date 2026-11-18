-- =============================================================================
-- kis_tokens.expires_at 복구 (#199)
-- -----------------------------------------------------------------------------
-- 운영 DB에서 expires_at 컬럼이 사라져 get_kis_token / upsert_kis_token RPC가
-- 실패했고, /api/quote 전체가 404 QUOTE_NOT_FOUND를 반환했다.
-- 2026-11-18 Supabase SQL 에디터에서 아래 문장을 직접 실행해 복구했으며,
-- 이 파일은 그 조치를 마이그레이션 이력으로 남기기 위한 것이다(유령 마이그레이션 방지).
-- 운영에는 이미 적용돼 있으므로 if not exists로 멱등하게 작성한다.
--
-- 원본(20260713000001_kis_token_cache.sql)은 `expires_at timestamptz not null`로
-- default가 없다. 여기서는 기존 행이 있어도 not null을 추가할 수 있도록
-- default now()를 둔다(운영에 실제 적용된 정의와 동일). upsert_kis_token이 항상
-- 값을 넣으므로 default가 쓰일 일은 없고, 쓰이더라도 "즉시 만료"라 안전한 쪽이다.
--
-- 컬럼이 사라진 원인: 마이그레이션 중 kis_tokens를 drop/재생성하거나 expires_at을
-- 지우는 것은 없다. 마이그레이션 밖(대시보드/SQL 에디터)에서 변경된 것으로 추정.
-- =============================================================================

alter table public.kis_tokens
  add column if not exists expires_at timestamptz not null default now();
