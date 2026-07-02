-- =============================================================================
-- 20260628000001 - 소셜 스키마 유령 마이그레이션 복구
-- -----------------------------------------------------------------------------
-- 지난 세션에서 원격 DB에 직접 실행됐으나 레포에는 한 번도 커밋되지 않은
-- 마이그레이션의 실제 효과를 db pull로 확인한 실제 원격 스키마와 대조해서
-- 복원한 것입니다. 원격 마이그레이션 이력 테이블에서는 `migration repair
-- --status reverted 20260628000001`로 지워졌지만(20260701000002 주석 참고),
-- 실제 스키마 변경 자체는 원격 DB에 그대로 남아있었습니다.
--
-- 확인된 변경 내역:
--   1) posts.body -> posts.content, comments.body -> comments.content,
--      post_reactions.reaction -> post_reactions.type 컬럼명 변경
--   2) 소셜 인덱스를 idx_<table>_<col> 네이밍으로 재작성 (일부는 partial
--      WHERE 조건도 함께 제거됨), comments(author_id)/posts(repost_of)
--      인덱스 신규 추가
--   3) posts_updated_at/comments_updated_at 트리거를 trg_posts_updated/
--      trg_comments_updated로 재생성
--   4) posts_with_author 뷰에 좋아요/싫어요/댓글 수 집계 컬럼 추가,
--      community_posts/feed_posts 뷰 재정의
--      ⚠️ feed_posts는 원래 002에서 "팔로우한 사람 글만" 보여주는 개인화
--      피드였으나, 여기서 "stock_id가 없는 전체 글(최신순)"을 보여주는
--      전역 피드로 로직 자체가 바뀌었습니다. 의도된 변경인지 별도 확인 필요.
--   5) posts_read_all/comments_read_all/reactions_read_all/follows_read_all/
--      profiles_read_all 중복 정책 추가 (role 제한 없음 - 이후
--      20260701000002에서 authenticated로 제한됨)
--   6) comments/follows/post_reactions/posts/profiles의 "xxx: yyy" 콜론
--      네이밍 쓰기(insert/update/delete) 정책을 "xxx_yyy_own" 스네이크케이스로
--      교체. post_reactions는 update 정책이 아예 삭제됨(반응은 등록/삭제만
--      허용). profiles에는 profiles_insert_own/profiles_update_icon_own이
--      신규 추가됨
--   7) posts.stock_id_fkey를 ON DELETE SET NULL -> ON DELETE CASCADE로 변경
--   8) follows 테이블을 복합PK(follower_id, following_id)에서 surrogate
--      id PK + 별도 UNIQUE(follower_id, following_id)로 재구성
-- =============================================================================

-- ── 컬럼명 변경 ──────────────────────────────────────────────────────────────
alter table public.posts rename column body to content;
alter table public.comments rename column body to content;
alter table public.post_reactions rename column reaction to type;
alter table public.post_reactions rename constraint post_reactions_reaction_check to post_reactions_type_check;

-- ── 소셜 인덱스 재작성 ───────────────────────────────────────────────────────
drop index if exists public.posts_author_idx;
drop index if exists public.posts_stock_idx;
drop index if exists public.posts_created_idx;
drop index if exists public.comments_post_idx;
drop index if exists public.comments_parent_idx;
drop index if exists public.reactions_post_idx;
drop index if exists public.follows_follower_idx;
drop index if exists public.follows_following_idx;

create index if not exists idx_posts_author    on public.posts using btree (author_id);
create index if not exists idx_posts_created   on public.posts using btree (created_at desc);
create index if not exists idx_posts_repost    on public.posts using btree (repost_of);
create index if not exists idx_posts_stock     on public.posts using btree (stock_id);
create index if not exists idx_comments_author on public.comments using btree (author_id);
create index if not exists idx_comments_parent on public.comments using btree (parent_comment_id);
create index if not exists idx_comments_post   on public.comments using btree (post_id);
create index if not exists idx_follows_follower  on public.follows using btree (follower_id);
create index if not exists idx_follows_following on public.follows using btree (following_id);
create index if not exists idx_reactions_post  on public.post_reactions using btree (post_id);

-- ── updated_at 트리거 재생성 ─────────────────────────────────────────────────
drop trigger if exists posts_updated_at on public.posts;
create trigger trg_posts_updated
  before update on public.posts
  for each row execute function public.set_updated_at();

drop trigger if exists comments_updated_at on public.comments;
create trigger trg_comments_updated
  before update on public.comments
  for each row execute function public.set_updated_at();

-- ── 뷰 재정의 ────────────────────────────────────────────────────────────────
-- 컬럼 순서/이름이 바뀌므로 CREATE OR REPLACE로는 불가 (postgres는 뷰의
-- 기존 컬럼 순서 변경을 허용하지 않음) - 의존관계 역순으로 드랍 후 재생성
drop view if exists public.community_posts;
drop view if exists public.feed_posts;
drop view if exists public.posts_with_author;

create view public.posts_with_author as
select
  p.id,
  p.author_id,
  p.content,
  p.stock_id,
  p.repost_of,
  p.created_at,
  pr.nickname as author_nickname,
  pr.icon as author_icon,
  (select count(*) from public.post_reactions
     where post_reactions.post_id = p.id and post_reactions.type = 'like') as like_count,
  (select count(*) from public.post_reactions
     where post_reactions.post_id = p.id and post_reactions.type = 'dislike') as dislike_count,
  (select count(*) from public.comments
     where comments.post_id = p.id) as comment_count
from public.posts p
left join public.profiles pr on pr.id = p.author_id;

create or replace view public.community_posts as
select
  id, author_id, content, stock_id, repost_of, created_at,
  author_nickname, author_icon, like_count, dislike_count, comment_count
from public.posts_with_author
where stock_id is not null
order by created_at desc;

create or replace view public.feed_posts as
select
  id, author_id, content, stock_id, repost_of, created_at,
  author_nickname, author_icon, like_count, dislike_count, comment_count
from public.posts_with_author
where stock_id is null
order by created_at desc;

-- ── 중복 read_all 정책 추가 (원본 상태: role 제한 없음) ──────────────────────
drop policy if exists "posts_read_all" on public.posts;
create policy "posts_read_all" on public.posts for select using (true);

drop policy if exists "comments_read_all" on public.comments;
create policy "comments_read_all" on public.comments for select using (true);

drop policy if exists "reactions_read_all" on public.post_reactions;
create policy "reactions_read_all" on public.post_reactions for select using (true);

drop policy if exists "follows_read_all" on public.follows;
create policy "follows_read_all" on public.follows for select using (true);

drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles for select using (true);

-- ── 쓰기 정책 콜론 네이밍 -> 스네이크케이스 교체 ──────────────────────────────
drop policy if exists "comments: author can delete" on public.comments;
drop policy if exists "comments: author can insert" on public.comments;
drop policy if exists "comments: author can update" on public.comments;
create policy "comments_delete_own" on public.comments for delete using (auth.uid() = author_id);
create policy "comments_insert_own" on public.comments for insert with check (auth.uid() = author_id);
create policy "comments_update_own" on public.comments for update using (auth.uid() = author_id);

drop policy if exists "follows: user can follow" on public.follows;
drop policy if exists "follows: user can unfollow" on public.follows;
create policy "follows_insert_own" on public.follows for insert with check (auth.uid() = follower_id);
create policy "follows_delete_own" on public.follows for delete using (auth.uid() = follower_id);

-- reactions: update 정책은 대체 없이 삭제됨 (반응은 등록/삭제만 허용)
drop policy if exists "reactions: user can delete" on public.post_reactions;
drop policy if exists "reactions: user can insert" on public.post_reactions;
drop policy if exists "reactions: user can update" on public.post_reactions;
create policy "reactions_delete_own" on public.post_reactions for delete using (auth.uid() = user_id);
create policy "reactions_insert_own" on public.post_reactions for insert with check (auth.uid() = user_id);

drop policy if exists "posts: author can delete" on public.posts;
drop policy if exists "posts: author can insert" on public.posts;
drop policy if exists "posts: author can update" on public.posts;
create policy "posts_delete_own" on public.posts for delete using (auth.uid() = author_id);
create policy "posts_insert_own" on public.posts for insert with check (auth.uid() = author_id);
create policy "posts_update_own" on public.posts for update using (auth.uid() = author_id);

drop policy if exists "profiles: user can update" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_icon_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── posts.stock_id 외래키: SET NULL -> CASCADE ──────────────────────────────
alter table public.posts drop constraint posts_stock_id_fkey;
alter table public.posts add constraint posts_stock_id_fkey
  foreign key (stock_id) references public.stocks(id) on delete cascade;

-- ── follows: 복합PK -> surrogate id PK + UNIQUE(follower_id, following_id) ──
alter table public.follows drop constraint follows_pkey;
alter table public.follows add column id uuid not null default gen_random_uuid();
alter table public.follows add constraint follows_pkey primary key (id);
alter table public.follows add constraint follows_follower_id_following_id_key unique (follower_id, following_id);
