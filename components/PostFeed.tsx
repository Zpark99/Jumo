"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/relativeTime";
import ReactionButtons, {
  ReactionState,
  ReactionType,
} from "@/components/ReactionButtons";
import QuotedPostCard, { QuotedPost } from "@/components/QuotedPostCard";
import RepostModal from "@/components/RepostModal";

type PostRow = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_nickname: string | null;
  author_icon: string | null;
  like_count: number;
  dislike_count: number;
  comment_count: number;
  repost_of: string | null;
};

type Post = PostRow & {
  my_reaction: ReactionType | null;
  original: QuotedPost | null;
};

type SortMode = "latest" | "popular";

const PAGE_SIZE = 20;
// feed_posts/community_posts는 supabase/config.toml의 max_rows(1000)를 초과해
// 한 번에 못 가져온다. 인기순은 이 범위(최신 1000건) 안에서만 정확하다 -
// 게시물이 그 이상 쌓이면 정렬용 스코어 컬럼을 DB에 두는 방식으로 바꿔야 한다.
const POPULAR_FETCH_LIMIT = 1000;
const MAX_BODY_LENGTH = 500;

const POST_SELECT =
  "id, author_id, content, created_at, author_nickname, author_icon, like_count, dislike_count, comment_count, repost_of";

const ORIGINAL_SELECT =
  "id, content, created_at, author_nickname, author_icon, repost_of";

function popularityScore(p: Post) {
  return p.like_count - p.dislike_count + p.comment_count * 2;
}

function sortByPopularity(rows: Post[]) {
  return [...rows].sort((a, b) => {
    const diff = popularityScore(b) - popularityScore(a);
    if (diff !== 0) return diff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// post_reactions(내 반응)와 repost_of가 가리키는 원글을, 글마다 개별 조회하지
// 않고 화면에 있는 글 id 전체에 대해 한 번씩만 조회해 병합한다.
async function enrichPosts(rows: PostRow[], userId: string) {
  if (rows.length === 0) {
    return { data: [] as Post[], error: null };
  }

  const ids = rows.map((r) => r.id);
  const originalIds = [
    ...new Set(
      rows.filter((r) => r.repost_of).map((r) => r.repost_of as string)
    ),
  ];

  const [reactionsResult, originalsResult] = await Promise.all([
    supabase
      .from("post_reactions")
      .select("post_id, type")
      .eq("user_id", userId)
      .in("post_id", ids),
    originalIds.length > 0
      ? supabase.from("posts_with_author").select(ORIGINAL_SELECT).in("id", originalIds)
      : Promise.resolve({ data: [] as QuotedPost[], error: null }),
  ]);

  const error = reactionsResult.error ?? originalsResult.error ?? null;

  const reactionByPost = new Map(
    (reactionsResult.data ?? []).map((r) => [r.post_id as string, r.type as ReactionType])
  );
  const originalById = new Map(
    (originalsResult.data ?? []).map((o) => [(o as QuotedPost).id, o as QuotedPost])
  );

  return {
    data: rows.map((r) => ({
      ...r,
      my_reaction: reactionByPost.get(r.id) ?? null,
      original: r.repost_of ? originalById.get(r.repost_of) ?? null : null,
    })),
    error,
  };
}

type Props = {
  userId: string;
  table: "feed_posts" | "community_posts";
  // 작성/리포스트 insert에 고정으로 들어갈 stock_id. 전역 피드는 null, 종목
  // 커뮤니티는 해당 종목 id.
  stockId: string | null;
  composePlaceholder?: string;
  emptyMessage?: string;
};

export default function PostFeed({
  userId,
  table,
  stockId,
  composePlaceholder = "무슨 생각을 하고 계신가요?",
  emptyMessage = "아직 글이 없습니다",
}: Props) {
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [posts, setPosts] = useState<Post[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [hasMoreLatest, setHasMoreLatest] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);

  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [repostTarget, setRepostTarget] = useState<Post | null>(null);

  const fetchLatestPage = useCallback(
    (offset: number) => {
      let query = supabase.from(table).select(POST_SELECT);
      if (stockId) query = query.eq("stock_id", stockId);
      return query
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
    },
    [table, stockId]
  );

  const fetchPopularBase = useCallback(() => {
    let query = supabase.from(table).select(POST_SELECT);
    if (stockId) query = query.eq("stock_id", stockId);
    return query
      .order("created_at", { ascending: false })
      .limit(POPULAR_FETCH_LIMIT);
  }, [table, stockId]);

  const loadFirstPage = useCallback(
    async (mode: SortMode) => {
      setLoading(true);
      setLoadError(null);

      if (mode === "latest") {
        const { data, error } = await fetchLatestPage(0);
        if (error) {
          setLoadError(error.message);
        } else {
          const { data: enriched, error: enrichErr } = await enrichPosts(
            data ?? [],
            userId
          );
          if (enrichErr) setLoadError(enrichErr.message);
          setPosts(enriched);
          setHasMoreLatest((data?.length ?? 0) === PAGE_SIZE);
        }
      } else {
        const { data, error } = await fetchPopularBase();
        if (error) {
          setLoadError(error.message);
        } else {
          const { data: enriched, error: enrichErr } = await enrichPosts(
            data ?? [],
            userId
          );
          if (enrichErr) setLoadError(enrichErr.message);
          setPosts(sortByPopularity(enriched));
          setVisibleCount(PAGE_SIZE);
        }
      }

      setLoading(false);
    },
    [fetchLatestPage, fetchPopularBase, userId]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      await loadFirstPage(sortMode);
      if (!active) return;
    }

    load();
    return () => {
      active = false;
    };
  }, [sortMode, loadFirstPage]);

  const loadMoreLatest = async () => {
    setLoadingMore(true);
    const { data, error } = await fetchLatestPage(posts.length);
    if (error) {
      setLoadError(error.message);
    } else {
      const { data: enriched, error: enrichErr } = await enrichPosts(
        data ?? [],
        userId
      );
      if (enrichErr) setLoadError(enrichErr.message);
      setPosts((prev) => [...prev, ...enriched]);
      setHasMoreLatest((data?.length ?? 0) === PAGE_SIZE);
    }
    setLoadingMore(false);
  };

  const handleReactionChange = (postId: string, next: ReactionState) => {
    setPosts((prev) => {
      const updated = prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              like_count: next.likeCount,
              dislike_count: next.dislikeCount,
              my_reaction: next.myReaction,
            }
          : p
      );
      return sortMode === "popular" ? sortByPopularity(updated) : updated;
    });
  };

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed) {
      setSubmitError("내용을 입력해주세요");
      return;
    }
    if (trimmed.length > MAX_BODY_LENGTH) {
      setSubmitError(`${MAX_BODY_LENGTH}자 이내로 작성해주세요`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const { error } = await supabase.from("posts").insert({
      author_id: userId,
      stock_id: stockId,
      content: trimmed,
    });

    if (error) {
      setSubmitError(error.message);
      setSubmitting(false);
      return;
    }

    setBody("");
    setSubmitting(false);
    await loadFirstPage(sortMode);
  };

  const handleRepostSubmit = async (comment: string) => {
    if (!repostTarget) {
      return { error: "대상을 찾을 수 없습니다" };
    }

    const { error } = await supabase.from("posts").insert({
      author_id: userId,
      stock_id: stockId,
      content: comment,
      repost_of: repostTarget.id,
    });

    if (error) {
      return { error: error.message };
    }

    await loadFirstPage(sortMode);
    return { error: null };
  };

  return (
    <div className="space-y-6">
      {/* 작성 폼 */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={composePlaceholder}
          rows={3}
          className="w-full resize-none rounded-2xl border border-border bg-surface p-4 text-sm text-fg-primary outline-none focus:border-brand"
        />
        <div className="mt-3 flex items-center justify-between">
          <span
            className={`text-xs ${
              body.trim().length > MAX_BODY_LENGTH
                ? "text-red-500"
                : "text-fg-muted"
            }`}
          >
            {body.trim().length}/{MAX_BODY_LENGTH}
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex h-9 items-center justify-center rounded-full bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-pressed disabled:opacity-50"
          >
            {submitting ? "등록 중..." : "등록"}
          </button>
        </div>
        {submitError && (
          <p className="mt-2 text-sm text-red-500">{submitError}</p>
        )}
      </section>

      {/* 정렬 토글 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSortMode("latest")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            sortMode === "latest"
              ? "bg-brand text-white"
              : "bg-surface text-fg-secondary hover:bg-border"
          }`}
        >
          최신순
        </button>
        <button
          type="button"
          onClick={() => setSortMode("popular")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            sortMode === "popular"
              ? "bg-brand text-white"
              : "bg-surface text-fg-secondary hover:bg-border"
          }`}
        >
          인기순
        </button>
      </div>

      {/* 목록 */}
      {loadError && <p className="text-sm text-red-500">{loadError}</p>}
      {reactionError && (
        <p className="text-sm text-red-500">{reactionError}</p>
      )}

      {loading ? (
        <p className="text-sm text-fg-secondary">
          불러오는 중...
        </p>
      ) : posts.length === 0 ? (
        <p className="rounded-3xl border border-border bg-card p-6 text-center text-sm text-fg-secondary">
          {emptyMessage}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-3xl border border-border bg-card">
            {(sortMode === "latest"
              ? posts
              : posts.slice(0, visibleCount)
            ).map((post) => (
              <li
                key={post.id}
                className="px-6 py-4 transition-colors hover:bg-surface"
              >
                <div className="flex items-center gap-2">
                  <Link
                    href={`/profile/${post.author_id}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    {post.author_icon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.author_icon}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover"
                      />
                    )}
                    <span className="text-sm font-medium text-fg-primary">
                      {post.author_nickname ?? "알 수 없음"}
                    </span>
                  </Link>
                  <Link
                    href={`/feed/${post.id}`}
                    className="text-xs text-fg-muted hover:text-fg-secondary"
                  >
                    · {relativeTime(post.created_at)}
                  </Link>
                </div>
                <Link href={`/feed/${post.id}`} className="block">
                  <p className="mt-2 whitespace-pre-wrap text-sm text-fg-primary">
                    {post.content}
                  </p>
                </Link>
                {post.repost_of && (
                  <QuotedPostCard original={post.original} />
                )}
                <div className="mt-3 flex items-center gap-4">
                  <ReactionButtons
                    postId={post.id}
                    userId={userId}
                    state={{
                      likeCount: post.like_count,
                      dislikeCount: post.dislike_count,
                      myReaction: post.my_reaction,
                    }}
                    onChange={(next) => handleReactionChange(post.id, next)}
                    onError={setReactionError}
                  />
                  <button
                    type="button"
                    onClick={() => setRepostTarget(post)}
                    className="text-xs font-medium text-fg-muted hover:text-fg-secondary"
                  >
                    리포스트
                  </button>
                  <Link
                    href={`/feed/${post.id}`}
                    className="text-xs text-fg-muted hover:text-fg-secondary"
                  >
                    댓글 {post.comment_count}
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          {sortMode === "latest" && hasMoreLatest && (
            <button
              type="button"
              onClick={loadMoreLatest}
              disabled={loadingMore}
              className="w-full rounded-full border border-border py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface disabled:opacity-50"
            >
              {loadingMore ? "불러오는 중..." : "더 보기"}
            </button>
          )}

          {sortMode === "popular" && visibleCount < posts.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="w-full rounded-full border border-border py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface"
            >
              더 보기
            </button>
          )}
        </>
      )}

      {repostTarget && (
        <RepostModal
          original={repostTarget}
          onClose={() => setRepostTarget(null)}
          onSubmit={handleRepostSubmit}
        />
      )}
    </div>
  );
}
