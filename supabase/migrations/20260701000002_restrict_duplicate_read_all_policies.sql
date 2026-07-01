-- =============================================================================
-- 20260701000001에서 "xxx: anyone can read"(콜론 네이밍) 정책만 authenticated로
-- 제한했으나, 레포에 없던 마이그레이션(원격 이력상 20260628000001, 지금은
-- reverted 처리됨)이 별도로 만든 "xxx_read_all"(스네이크케이스, role=public)
-- 정책이 각 테이블에 중복 존재해 익명 읽기가 여전히 열려 있었다.
-- RLS는 같은 커맨드에 대한 정책을 OR로 합산하므로, 이 중복 정책도 함께
-- authenticated로 제한해야 실질적으로 익명 차단이 된다.
-- =============================================================================

alter policy "posts_read_all"      on public.posts          to authenticated;
alter policy "comments_read_all"   on public.comments       to authenticated;
alter policy "reactions_read_all"  on public.post_reactions to authenticated;
alter policy "follows_read_all"    on public.follows        to authenticated;
alter policy "profiles_read_all"   on public.profiles       to authenticated;
