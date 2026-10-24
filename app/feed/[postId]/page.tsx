"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { UUID_RE } from "@/lib/constants";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import { ReactionState } from "@/components/ReactionButtons";
import { QuotedPost } from "@/components/QuotedPostCard";
import RepostModal from "@/components/RepostModal";
import PostCard from "./PostCard";
import CommentItem from "./CommentItem";
import CommentForm from "./CommentForm";
import {
  buildCommentTree,
  MAX_COMMENT_LENGTH,
  type CommentRow,
  type PostDetail,
} from "./types";

const POST_SELECT =
  "id, author_id, content, created_at, author_nickname, author_icon, like_count, dislike_count, comment_count, repost_of";

const ORIGINAL_SELECT =
  "id, content, created_at, author_nickname, author_icon, repost_of";

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

async function fetchOriginal(repostOfId: string) {
  return supabase
    .from("posts_with_author")
    .select(ORIGINAL_SELECT)
    .eq("id", repostOfId)
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

export default function PostDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = use(params);
  const router = useRouter();
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

  const [original, setOriginal] = useState<QuotedPost | null | undefined>(
    undefined
  );
  const [repostTarget, setRepostTarget] = useState<PostDetail | null>(null);

  useEffect(() => {
    if (userLoading || !user) return;
    const userId = user.id;

    let active = true;

    async function load() {
      setPostLoading(true);
      setCommentsLoading(true);
      setLoadError(null);

      // UUID 형식이 아니면 DB 조회 없이 "글을 찾을 수 없음" 빈 상태로 (#173)
      if (!UUID_RE.test(postId)) {
        setPost(null);
        setPostLoading(false);
        setCommentsLoading(false);
        return;
      }

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

  useEffect(() => {
    const repostOfId = post?.repost_of ?? null;

    let active = true;

    async function load() {
      if (!repostOfId) {
        setOriginal(null);
        return;
      }
      const { data, error } = await fetchOriginal(repostOfId);
      if (!active) return;
      if (error) {
        setOriginal(null);
        return;
      }
      setOriginal(data ?? null);
    }

    load();
    return () => {
      active = false;
    };
  }, [post?.repost_of]);

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

  const handleDeletePost = async (targetPostId: string) => {
    setDeleting(true);
    setDeleteError(null);

    // RLS로 막히거나 이미 지워진 글은 에러 없이 0행이 반환되므로 행 수로 판별
    const { data, error } = await supabase
      .from("posts")
      .delete()
      .eq("id", targetPostId)
      .select("id");

    if (error) {
      setDeleteError(error.message);
      setDeleting(false);
      return;
    }
    if (!data || data.length === 0) {
      setDeleteError("삭제할 수 없는 글입니다 (권한이 없거나 이미 삭제됨)");
      setDeleting(false);
      return;
    }

    // deleting은 유지해 이동 중 중복 클릭을 막는다
    router.replace("/feed");
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

  const handleRepostSubmit = async (comment: string) => {
    if (!user || !repostTarget) {
      return { error: "로그인이 필요합니다" };
    }

    const { error } = await supabase.from("posts").insert({
      author_id: user.id,
      stock_id: null,
      content: comment,
      repost_of: repostTarget.id,
    });

    if (error) {
      return { error: error.message };
    }

    await refresh();
    return { error: null };
  };

  const tree = buildCommentTree(comments);
  const deletingPost = !!post && deleteTarget === post.id;
  const deleteTargetHasReplies = deleteTarget
    ? comments.some((c) => c.parent_comment_id === deleteTarget)
    : false;

  return (
    <div className="flex flex-1 flex-col bg-page px-4 py-6 sm:px-6 lg:py-10">
      <div className="mx-auto w-full max-w-2xl space-y-4 break-keep">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-fg-primary">글 상세</h1>
          <Link
            href="/feed"
            className="tap text-sm font-medium text-fg-secondary transition-colors hover:text-fg-primary"
          >
            ← 피드로
          </Link>
        </div>

        {!userLoading && !user && (
          <section className="rounded-3xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-fg-secondary">
              글을 보려면 로그인이 필요합니다
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-pressed"
            >
              로그인
            </Link>
          </section>
        )}

        {!userLoading && user && (
          <>
            {loadError && <p className="text-sm text-danger">{loadError}</p>}

            {postLoading ? (
              /* 스켈레톤 — 글 카드 + 댓글 2줄 */
              <>
                <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-surface" />
                    <div className="space-y-2">
                      <div className="h-3.5 w-24 animate-pulse rounded bg-surface" />
                      <div className="h-3 w-14 animate-pulse rounded bg-surface" />
                    </div>
                  </div>
                  <div className="mt-5 space-y-2">
                    <div className="h-4 w-full animate-pulse rounded bg-surface" />
                    <div className="h-4 w-2/3 animate-pulse rounded bg-surface" />
                  </div>
                  <div className="mt-5 h-6 w-48 animate-pulse rounded-full bg-surface" />
                </section>
                <section className="divide-y divide-border rounded-3xl border border-border bg-card">
                  {[0, 1].map((i) => (
                    <div key={i} className="flex gap-3 px-5 py-4 sm:px-6">
                      <div className="h-8 w-8 animate-pulse rounded-full bg-surface" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-20 animate-pulse rounded bg-surface" />
                        <div className="h-3.5 w-3/4 animate-pulse rounded bg-surface" />
                      </div>
                    </div>
                  ))}
                </section>
              </>
            ) : !post ? (
              <section className="rounded-3xl border border-border bg-card p-8 text-center">
                <p className="text-sm font-medium text-fg-primary">
                  글을 찾을 수 없습니다
                </p>
                <p className="mt-1 text-xs text-fg-muted">
                  삭제되었거나 잘못된 주소입니다
                </p>
                <Link
                  href="/feed"
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-border px-5 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface"
                >
                  피드로 가기
                </Link>
              </section>
            ) : (
              <>
                <PostCard
                  post={post}
                  original={original}
                  userId={user.id}
                  reactionError={reactionError}
                  onReactionChange={handleReactionChange}
                  onReactionError={setReactionError}
                  onRepost={() => setRepostTarget(post)}
                  onDelete={() => {
                    setDeleteError(null);
                    setDeleteTarget(post.id);
                  }}
                />

                {/* 댓글 — 목록 + 작성 */}
                <section className="overflow-hidden rounded-3xl border border-border bg-card">
                  <h2 className="px-5 py-4 text-sm font-medium text-fg-secondary sm:px-6">
                    댓글
                    <span className="ml-1.5 tabular-nums text-fg-muted">
                      {comments.length}
                    </span>
                  </h2>

                  {commentsLoading ? (
                    <div className="space-y-2 border-t border-border px-5 py-4 sm:px-6">
                      <div className="h-3 w-20 animate-pulse rounded bg-surface" />
                      <div className="h-3.5 w-3/4 animate-pulse rounded bg-surface" />
                    </div>
                  ) : tree.length === 0 ? (
                    <div className="border-t border-border p-8 text-center">
                      <p className="text-sm font-medium text-fg-primary">
                        아직 댓글이 없습니다
                      </p>
                      <p className="mt-1 text-xs text-fg-muted">
                        첫 댓글을 남겨보세요
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-border border-t border-border">
                      {tree.map((node) => (
                        <CommentItem
                          key={node.id}
                          node={node}
                          userId={user.id}
                          postAuthorId={post.author_id}
                          onReply={() => toggleReply(node.id)}
                          onDelete={setDeleteTarget}
                          replyForm={
                            replyTarget === node.id && (
                              <CommentForm
                                value={replyBody}
                                onChange={setReplyBody}
                                onSubmit={() => handleSubmitReply(node.id)}
                                onCancel={() => toggleReply(node.id)}
                                submitting={replySubmitting}
                                error={replySubmitError}
                                placeholder="답글을 입력하세요"
                                compact
                              />
                            )
                          }
                        />
                      ))}
                    </ul>
                  )}

                  <div className="border-t border-border p-5 sm:p-6">
                    <CommentForm
                      value={commentBody}
                      onChange={setCommentBody}
                      onSubmit={handleSubmitComment}
                      submitting={commentSubmitting}
                      error={commentSubmitError}
                      placeholder="댓글을 입력하세요"
                    />
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold text-fg-primary">
              {deletingPost ? "글 삭제" : "댓글 삭제"}
            </h3>
            <p className="mt-2 text-sm text-fg-secondary">
              정말 삭제하시겠습니까?
              {deletingPost &&
                " 댓글과 반응이 함께 삭제되고, 이 글을 인용한 리포스트에서는 인용이 사라집니다."}
              {deleteTargetHasReplies && " 달려있는 답글도 함께 삭제됩니다."}
            </p>
            {deleteError && (
              <p className="mt-2 text-sm text-danger">{deleteError}</p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="flex-1 rounded-full border border-border py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() =>
                  deletingPost
                    ? handleDeletePost(deleteTarget)
                    : handleDeleteComment(deleteTarget)
                }
                disabled={deleting}
                className="flex-1 rounded-full bg-danger py-2 text-sm font-medium text-white transition-colors hover:bg-danger-pressed disabled:opacity-50"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
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
