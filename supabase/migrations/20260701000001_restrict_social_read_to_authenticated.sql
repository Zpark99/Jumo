-- =============================================================================
-- 002_social_schema.sql의 "anyone can read" 정책들이 role 제한 없이
-- using(true)로만 걸려 있어, 로그인하지 않은 anon key 요청도 profiles/posts/
-- comments/post_reactions/follows 전체를 읽을 수 있었다. 로그인 사용자만
-- 읽도록 제한한다(공개 여부는 향후 별도 정책으로 다시 열 수 있음).
-- =============================================================================

drop policy if exists "profiles: anyone can read" on public.profiles;
create policy "profiles: anyone can read"
  on public.profiles for select to authenticated using (true);

drop policy if exists "posts: anyone can read" on public.posts;
create policy "posts: anyone can read"
  on public.posts for select to authenticated using (true);

drop policy if exists "comments: anyone can read" on public.comments;
create policy "comments: anyone can read"
  on public.comments for select to authenticated using (true);

drop policy if exists "reactions: anyone can read" on public.post_reactions;
create policy "reactions: anyone can read"
  on public.post_reactions for select to authenticated using (true);

drop policy if exists "follows: anyone can read" on public.follows;
create policy "follows: anyone can read"
  on public.follows for select to authenticated using (true);
