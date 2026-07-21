"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

type FeedPost = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_nickname: string | null;
  author_icon: string | null;
  like_count: number;
  dislike_count: number;
  comment_count: number;
};

type SortMode = "latest" | "popular";

const PAGE_SIZE = 20;
// feed_posts는 supabase/config.toml의 max_rows(1000)를 초과해 한 번에 못 가져온다.
// 인기순은 이 범위(최신 1000건) 안에서만 정확하다 - 게시물이 그 이상 쌓이면
// 정렬용 스코어 컬럼을 DB에 두는 방식으로 바꿔야 한다.
const POPULAR_FETCH_LIMIT = 1000;
const MAX_BODY_LENGTH = 500;

const FEED_SELECT =
  "id, author_id, content, created_at, author_nickname, author_icon, like_count, dislike_count, comment_count";

function popularityScore(p: FeedPost) {
  return p.like_count - p.dislike_count + p.comment_count * 2;
}

function sortByPopularity(rows: FeedPost[]) {
  return [...rows].sort((a, b) => {
    const diff = popularityScore(b) - popularityScore(a);
    if (diff !== 0) return diff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "방금 전";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

export default function FeedPage() {
  const { user, loading: userLoading } = useSupabaseUser();

  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [hasMoreLatest, setHasMoreLatest] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchLatestPage = useCallback((offset: number) => {
    return supabase
      .from("feed_posts")
      .select(FEED_SELECT)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
  }, []);

  const fetchPopularBase = useCallback(() => {
    return supabase
      .from("feed_posts")
      .select(FEED_SELECT)
      .order("created_at", { ascending: false })
      .limit(POPULAR_FETCH_LIMIT);
  }, []);

  const loadFirstPage = useCallback(
    async (mode: SortMode) => {
      setLoading(true);
      setLoadError(null);

      if (mode === "latest") {
        const { data, error } = await fetchLatestPage(0);
        if (error) {
          setLoadError(error.message);
        } else {
          setPosts(data ?? []);
          setHasMoreLatest((data?.length ?? 0) === PAGE_SIZE);
        }
      } else {
        const { data, error } = await fetchPopularBase();
        if (error) {
          setLoadError(error.message);
        } else {
          setPosts(sortByPopularity(data ?? []));
          setVisibleCount(PAGE_SIZE);
        }
      }

      setLoading(false);
    },
    [fetchLatestPage, fetchPopularBase]
  );

  useEffect(() => {
    // 비로그인 상태에서는 posts RLS(authenticated 전용)에 막혀 목록을
    // 어차피 렌더링하지 않으므로, 여기서 상태를 리셋할 필요가 없다
    // (렌더 분기가 이미 !user일 때 이 state를 쓰지 않음).
    if (userLoading || !user) return;

    let active = true;

    async function load() {
      await loadFirstPage(sortMode);
      if (!active) return;
    }

    load();
    return () => {
      active = false;
    };
  }, [user, userLoading, sortMode, loadFirstPage]);

  const loadMoreLatest = async () => {
    setLoadingMore(true);
    const { data, error } = await fetchLatestPage(posts.length);
    if (error) {
      setLoadError(error.message);
    } else {
      setPosts((prev) => [...prev, ...(data ?? [])]);
      setHasMoreLatest((data?.length ?? 0) === PAGE_SIZE);
    }
    setLoadingMore(false);
  };

  const handleSubmit = async () => {
    if (!user) return;

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
      author_id: user.id,
      stock_id: null,
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

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            피드
          </h1>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 underline hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            홈으로
          </Link>
        </div>

        {!userLoading && !user && (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              피드를 보려면 로그인이 필요합니다
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              로그인
            </Link>
          </section>
        )}

        {!userLoading && user && (
          <>
            {/* 작성 폼 */}
            <section className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="무슨 생각을 하고 계신가요?"
                rows={3}
                className="w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-950 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-600"
              />
              <div className="mt-3 flex items-center justify-between">
                <span
                  className={`text-xs ${
                    body.trim().length > MAX_BODY_LENGTH
                      ? "text-red-500"
                      : "text-zinc-400 dark:text-zinc-500"
                  }`}
                >
                  {body.trim().length}/{MAX_BODY_LENGTH}
                </span>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex h-9 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
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
                    ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                }`}
              >
                최신순
              </button>
              <button
                type="button"
                onClick={() => setSortMode("popular")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  sortMode === "popular"
                    ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                }`}
              >
                인기순
              </button>
            </div>

            {/* 목록 */}
            {loadError && <p className="text-sm text-red-500">{loadError}</p>}

            {loading ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                불러오는 중...
              </p>
            ) : posts.length === 0 ? (
              <p className="rounded-3xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                아직 글이 없습니다
              </p>
            ) : (
              <>
                <ul className="divide-y divide-zinc-100 rounded-3xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
                  {(sortMode === "latest"
                    ? posts
                    : posts.slice(0, visibleCount)
                  ).map((post) => (
                    <li key={post.id}>
                      <Link
                        href={`/feed/${post.id}`}
                        className="block px-6 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      >
                        <div className="flex items-center gap-2">
                          {post.author_icon && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={post.author_icon}
                              alt=""
                              className="h-6 w-6 rounded-full object-cover"
                            />
                          )}
                          <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                            {post.author_nickname ?? "알 수 없음"}
                          </span>
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">
                            · {relativeTime(post.created_at)}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
                          {post.content}
                        </p>
                        <div className="mt-3 flex gap-4 text-xs text-zinc-400 dark:text-zinc-500">
                          <span>좋아요 {post.like_count}</span>
                          <span>댓글 {post.comment_count}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>

                {sortMode === "latest" && hasMoreLatest && (
                  <button
                    type="button"
                    onClick={loadMoreLatest}
                    disabled={loadingMore}
                    className="w-full rounded-full border border-zinc-200 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    {loadingMore ? "불러오는 중..." : "더 보기"}
                  </button>
                )}

                {sortMode === "popular" && visibleCount < posts.length && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    className="w-full rounded-full border border-zinc-200 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    더 보기
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
