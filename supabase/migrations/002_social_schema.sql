-- =============================================================================
-- 002 social schema
-- profiles 확장 + posts/comments/post_reactions/follows + RLS + 편의뷰
-- =============================================================================

-- ── profiles 확장 ────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists icon text,
  add column if not exists bio  text;

-- ── posts ────────────────────────────────────────────────────────────────────
create table if not exists public.posts (
  id         uuid        primary key default gen_random_uuid(),
  author_id  uuid        not null references auth.users(id) on delete cascade,
  stock_id   text        references public.stocks(id) on delete set null,
  body       text        not null,
  repost_of  uuid        references public.posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── comments ─────────────────────────────────────────────────────────────────
create table if not exists public.comments (
  id                uuid        primary key default gen_random_uuid(),
  post_id           uuid        not null references public.posts(id) on delete cascade,
  author_id         uuid        not null references auth.users(id) on delete cascade,
  parent_comment_id uuid        references public.comments(id) on delete cascade,
  body              text        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── post_reactions ───────────────────────────────────────────────────────────
create table if not exists public.post_reactions (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references public.posts(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  reaction   text        not null check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

-- ── follows ──────────────────────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id  uuid        not null references auth.users(id) on delete cascade,
  following_id uuid        not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

-- ── 인덱스 ───────────────────────────────────────────────────────────────────
create index if not exists posts_author_idx      on public.posts(author_id);
create index if not exists posts_stock_idx       on public.posts(stock_id) where stock_id is not null;
create index if not exists posts_created_idx     on public.posts(created_at desc);
create index if not exists comments_post_idx     on public.comments(post_id);
create index if not exists comments_parent_idx   on public.comments(parent_comment_id) where parent_comment_id is not null;
create index if not exists reactions_post_idx    on public.post_reactions(post_id);
create index if not exists follows_follower_idx  on public.follows(follower_id);
create index if not exists follows_following_idx on public.follows(following_id);

-- ── updated_at 트리거 ────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists posts_updated_at    on public.posts;
create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

drop trigger if exists comments_updated_at on public.comments;
create trigger comments_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- ── RLS 활성화 ───────────────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.posts          enable row level security;
alter table public.comments       enable row level security;
alter table public.post_reactions enable row level security;
alter table public.follows        enable row level security;

-- ── profiles 정책 ────────────────────────────────────────────────────────────
drop policy if exists "profiles: anyone can read"  on public.profiles;
create policy "profiles: anyone can read"
  on public.profiles for select using (true);

drop policy if exists "profiles: user can update"  on public.profiles;
create policy "profiles: user can update"
  on public.profiles for update using (auth.uid() = id);

-- ── posts 정책 ───────────────────────────────────────────────────────────────
drop policy if exists "posts: anyone can read"   on public.posts;
create policy "posts: anyone can read"
  on public.posts for select using (true);

drop policy if exists "posts: author can insert" on public.posts;
create policy "posts: author can insert"
  on public.posts for insert with check (auth.uid() = author_id);

drop policy if exists "posts: author can update" on public.posts;
create policy "posts: author can update"
  on public.posts for update using (auth.uid() = author_id);

drop policy if exists "posts: author can delete" on public.posts;
create policy "posts: author can delete"
  on public.posts for delete using (auth.uid() = author_id);

-- ── comments 정책 ────────────────────────────────────────────────────────────
drop policy if exists "comments: anyone can read"   on public.comments;
create policy "comments: anyone can read"
  on public.comments for select using (true);

drop policy if exists "comments: author can insert" on public.comments;
create policy "comments: author can insert"
  on public.comments for insert with check (auth.uid() = author_id);

drop policy if exists "comments: author can update" on public.comments;
create policy "comments: author can update"
  on public.comments for update using (auth.uid() = author_id);

drop policy if exists "comments: author can delete" on public.comments;
create policy "comments: author can delete"
  on public.comments for delete using (auth.uid() = author_id);

-- ── post_reactions 정책 ──────────────────────────────────────────────────────
drop policy if exists "reactions: anyone can read"  on public.post_reactions;
create policy "reactions: anyone can read"
  on public.post_reactions for select using (true);

drop policy if exists "reactions: user can insert"  on public.post_reactions;
create policy "reactions: user can insert"
  on public.post_reactions for insert with check (auth.uid() = user_id);

drop policy if exists "reactions: user can update"  on public.post_reactions;
create policy "reactions: user can update"
  on public.post_reactions for update using (auth.uid() = user_id);

drop policy if exists "reactions: user can delete"  on public.post_reactions;
create policy "reactions: user can delete"
  on public.post_reactions for delete using (auth.uid() = user_id);

-- ── follows 정책 ─────────────────────────────────────────────────────────────
drop policy if exists "follows: anyone can read"  on public.follows;
create policy "follows: anyone can read"
  on public.follows for select using (true);

drop policy if exists "follows: user can follow"  on public.follows;
create policy "follows: user can follow"
  on public.follows for insert with check (auth.uid() = follower_id);

drop policy if exists "follows: user can unfollow" on public.follows;
create policy "follows: user can unfollow"
  on public.follows for delete using (auth.uid() = follower_id);

-- ── 편의뷰 ───────────────────────────────────────────────────────────────────
create or replace view public.posts_with_author as
select
  p.*,
  pr.icon as author_icon,
  pr.bio  as author_bio
from public.posts p
left join public.profiles pr on pr.id = p.author_id;

-- 팔로우 피드 + 본인 글 포함
create or replace view public.feed_posts as
select p.*
from public.posts p
where p.author_id = auth.uid()
   or p.author_id in (
     select following_id from public.follows where follower_id = auth.uid()
   );

-- stock_id 있는 글만 (종목 커뮤니티)
create or replace view public.community_posts as
select p.*
from public.posts p
where p.stock_id is not null;
