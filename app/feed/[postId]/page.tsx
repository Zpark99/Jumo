"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import ReactionButtons, {
  ReactionState,
  ReactionType,
} from "@/components/ReactionButtons";

type PostDetail = {
  id: string;
  content: string;
  created_at: string;
  author_nickname: string | null;
  author_icon: string | null;
  like_count: number;
  dislike_count: number;
  comment_count: number;
  my_reaction: ReactionType | null;
};

type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
  author_nickname: string | null;
  author_icon: string | null;
};

type CommentNode = CommentRow & { replies: CommentRow[] };

const MAX_COMMENT_LENGTH = 300;

const POST_SELECT =
  "id, content, created_at, author_nickname, author_icon, like_count, dislike_count, comment_count";

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

// 최상위 댓글(parent_comment_id null) 아래에 대댓글을 1단계만 붙인다.
// rows는 created_at asc로 정렬되어 들어오므로 순서가 그대로 유지된다.
function buildCommentTree(rows: CommentRow[]): CommentNode[] {
  const topLevel: CommentNode[] = [];
  const nodeById = new Map<string, CommentNode>();

  for (const row of rows) {
    if (row.parent_comment_id === null) {
      const node: CommentNode = { ...row, replies: [] };
      nodeById.set(row.id, node);
      topLevel.push(node);
    }
  }

  for (const row of rows) {
    if (row.parent_comment_id !== null) {
      nodeById.get(row.parent_comment_id)?.replies.push(row);
    }
  }

  return topLevel;
}

async function fetchPost(postId: string) {
  return supabase
    .from("posts_with_author")
    .select(POST_SELECT)
    .eq("id", postId)
    .maybeSingle();
}

async function fetchMyReaction(postId: string, userId: string) {
  return supabase
    .from("post_reactions")
    .select("type")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();
}

async function fetchCommentsWithAuthors(postId: string) {
  const { data: rows, error } = await supabase
    .from("comments")
    .select("id, post_id, author_id, parent_comment_id, content, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error || !rows) {
    return { data: null as CommentRow[] | null, error };
  }

  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, nickname, icon")
    .in("id", authorIds);

  if (profilesError) {
    return { data: null as CommentRow[] | null, error: profilesError };
  }

  const profileById = new Map(profiles?.map((p) => [p.id, p]) ?? []);

  const merged: CommentRow[] = rows.map((r) => ({
    ...r,
    author_nickname: profileById.get(r.author_id)?.nickname ?? null,
    author_icon: profileById.get(r.author_id)?.icon ?? null,
  }));

  return { data: merged, error: null };
}

async function loadPostAndComments(postId: string, userId: string) {
  const [postResult, commentsResult, reactionResult] = await Promise.all([
    fetchPost(postId),
    fetchCommentsWithAuthors(postId),
    fetchMyReaction(postId, userId),
  ]);
  return { postResult, commentsResult, reactionResult };
}

function CommentBody({ comment }: { comment: CommentRow }) {
  return (
    <>
      <div className="flex items-center gap-2">
        {comment.author_icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={comment.author_icon}
            alt=""
            className="h-5 w-5 rounded-full object-cover"
          />
        )}
        <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
          {comment.author_nickname ?? "알 수 없음"}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          · {relativeTime(comment.created_at)}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
        {comment.content}
      </p>
    </>
  );
}

export default function PostDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = use(params);
  const { user, loading: userLoading } = useSupabaseUser();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [postLoading, setPostLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);

  const [commentBody, setCommentBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentSubmitError, setCommentSubmitError] = useState<string | null>(
    null
  );

  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replySubmitError, setReplySubmitError] = useState<string | null>(
    null
  );

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading || !user) return;
    const userId = user.id;

    let active = true;

    async function load() {
      setPostLoading(true);
      setCommentsLoading(true);
      setLoadError(null);

      const { postResult, commentsResult, reactionResult } =
        await loadPostAndComments(postId, userId);
      if (!active) return;

      if (postResult.error) {
        setLoadError(postResult.error.message);
      } else {
        setPost(
          postResult.data
            ? {
                ...postResult.data,
                my_reaction: reactionResult.data?.type ?? null,
              }
            : null
        );
      }
      if (reactionResult.error) {
        setLoadError(reactionResult.error.message);
      }

      if (commentsResult.error) {
        setLoadError(commentsResult.error.message);
      } else {
        setComments(commentsResult.data ?? []);
      }

      setPostLoading(false);
      setCommentsLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [user, userLoading, postId]);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { postResult, commentsResult, reactionResult } =
      await loadPostAndComments(postId, user.id);
    if (!postResult.error) {
      setPost(
        postResult.data
          ? { ...postResult.data, my_reaction: reactionResult.data?.type ?? null }
          : null
      );
    }
    if (!commentsResult.error) setComments(commentsResult.data ?? []);
  }, [postId, user]);

  const insertComment = (content: string, parentId: string | null) => {
    if (!user) return Promise.resolve({ error: { message: "로그인이 필요합니다" } });
    return supabase.from("comments").insert({
      post_id: postId,
      author_id: user.id,
      parent_comment_id: parentId,
      content,
    });
  };

  const handleSubmitComment = async () => {
    const trimmed = commentBody.trim();
    if (!trimmed) {
      setCommentSubmitError("내용을 입력해주세요");
      return;
    }
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setCommentSubmitError(`${MAX_COMMENT_LENGTH}자 이내로 작성해주세요`);
      return;
    }

    setCommentSubmitting(true);
    setCommentSubmitError(null);

    const { error } = await insertComment(trimmed, null);
    if (error) {
      setCommentSubmitError(error.message);
      setCommentSubmitting(false);
      return;
    }

    setCommentBody("");
    setCommentSubmitting(false);
    await refresh();
  };

  const handleSubmitReply = async (parentId: string) => {
    const trimmed = replyBody.trim();
    if (!trimmed) {
      setReplySubmitError("내용을 입력해주세요");
      return;
    }
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setReplySubmitError(`${MAX_COMMENT_LENGTH}자 이내로 작성해주세요`);
      return;
    }

    setReplySubmitting(true);
    setReplySubmitError(null);

    const { error } = await insertComment(trimmed, parentId);
    if (error) {
      setReplySubmitError(error.message);
      setReplySubmitting(false);
      return;
    }

    setReplyBody("");
    setReplyTarget(null);
    setReplySubmitting(false);
    await refresh();
  };

  const toggleReply = (commentId: string) => {
    setReplyTarget((prev) => (prev === commentId ? null : commentId));
    setReplyBody("");
    setReplySubmitError(null);
  };

  const handleDeleteComment = async (commentId: string) => {
    setDeleting(true);
    setDeleteError(null);

    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      setDeleteError(error.message);
      setDeleting(false);
      return;
    }

    setDeleting(false);
    setDeleteTarget(null);
    await refresh();
  };

  const handleReactionChange = (next: ReactionState) => {
    setPost((prev) =>
      prev
        ? {
            ...prev,
            like_count: next.likeCount,
            dislike_count: next.dislikeCount,
            my_reaction: next.myReaction,
          }
        : prev
    );
  };

  const tree = buildCommentTree(comments);
  const deleteTargetHasReplies = deleteTarget
    ? comments.some((c) => c.parent_comment_id === deleteTarget)
    : false;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            글 상세
          </h1>
          <Link
            href="/feed"
            className="text-sm font-medium text-zinc-600 underline hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            피드로
          </Link>
        </div>

        {!userLoading && !user && (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              글을 보려면 로그인이 필요합니다
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
            {loadError && <p className="text-sm text-red-500">{loadError}</p>}

            {postLoading ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                불러오는 중...
              </p>
            ) : !post ? (
              <p className="rounded-3xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                글을 찾을 수 없습니다
              </p>
            ) : (
              <>
                {/* 글 상세 */}
                <section className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
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
                  <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
                    {post.content}
                  </p>
                  <div className="mt-4 flex items-center gap-4">
                    <ReactionButtons
                      postId={post.id}
                      userId={user.id}
                      state={{
                        likeCount: post.like_count,
                        dislikeCount: post.dislike_count,
                        myReaction: post.my_reaction,
                      }}
                      onChange={handleReactionChange}
                      onError={setReactionError}
                    />
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      댓글 {post.comment_count}
                    </span>
                  </div>
                  {reactionError && (
                    <p className="mt-2 text-sm text-red-500">{reactionError}</p>
                  )}
                </section>

                {/* 댓글 목록 */}
                {commentsLoading ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    댓글 불러오는 중...
                  </p>
                ) : tree.length === 0 ? (
                  <p className="rounded-3xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    첫 댓글을 남겨보세요
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-100 rounded-3xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
                    {tree.map((node) => (
                      <li key={node.id} className="px-6 py-4">
                        <CommentBody comment={node} />
                        <div className="mt-2 flex gap-3 text-xs text-zinc-400 dark:text-zinc-500">
                          <button
                            type="button"
                            onClick={() => toggleReply(node.id)}
                            className="font-medium hover:text-zinc-700 dark:hover:text-zinc-300"
                          >
                            답글
                          </button>
                          {user.id === node.author_id && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(node.id)}
                              className="font-medium hover:text-red-500"
                            >
                              삭제
                            </button>
                          )}
                        </div>

                        {replyTarget === node.id && (
                          <div className="mt-3 space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-black">
                            <textarea
                              value={replyBody}
                              onChange={(e) => setReplyBody(e.target.value)}
                              placeholder="답글을 입력하세요"
                              rows={2}
                              maxLength={MAX_COMMENT_LENGTH}
                              className="w-full resize-none rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-950 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600"
                            />
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                {replyBody.trim().length}/{MAX_COMMENT_LENGTH}
                              </span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleReply(node.id)}
                                  className="rounded-full px-3 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                >
                                  취소
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSubmitReply(node.id)}
                                  disabled={replySubmitting}
                                  className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                                >
                                  {replySubmitting ? "등록 중..." : "등록"}
                                </button>
                              </div>
                            </div>
                            {replySubmitError && (
                              <p className="text-xs text-red-500">
                                {replySubmitError}
                              </p>
                            )}
                          </div>
                        )}

                        {node.replies.length > 0 && (
                          <ul className="mt-3 ml-6 space-y-3 border-l border-zinc-100 pl-4 dark:border-zinc-800">
                            {node.replies.map((reply) => (
                              <li key={reply.id}>
                                <CommentBody comment={reply} />
                                {user.id === reply.author_id && (
                                  <div className="mt-2 flex gap-3 text-xs text-zinc-400 dark:text-zinc-500">
                                    <button
                                      type="button"
                                      onClick={() => setDeleteTarget(reply.id)}
                                      className="font-medium hover:text-red-500"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {/* 댓글 작성 */}
                <section className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                  <textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="댓글을 입력하세요"
                    rows={3}
                    maxLength={MAX_COMMENT_LENGTH}
                    className="w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-950 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-600"
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {commentBody.trim().length}/{MAX_COMMENT_LENGTH}
                    </span>
                    <button
                      type="button"
                      onClick={handleSubmitComment}
                      disabled={commentSubmitting}
                      className="flex h-9 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                    >
                      {commentSubmitting ? "등록 중..." : "등록"}
                    </button>
                  </div>
                  {commentSubmitError && (
                    <p className="mt-2 text-sm text-red-500">
                      {commentSubmitError}
                    </p>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              댓글 삭제
            </h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              정말 삭제하시겠습니까?
              {deleteTargetHasReplies && " 달려있는 답글도 함께 삭제됩니다."}
            </p>
            {deleteError && (
              <p className="mt-2 text-sm text-red-500">{deleteError}</p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="flex-1 rounded-full border border-zinc-200 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => handleDeleteComment(deleteTarget)}
                disabled={deleting}
                className="flex-1 rounded-full bg-red-500 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
