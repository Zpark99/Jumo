import Link from "next/link";

import { relativeTime } from "@/lib/relativeTime";
import ReactionButtons, { ReactionState } from "@/components/ReactionButtons";
import QuotedPostCard, { QuotedPost } from "@/components/QuotedPostCard";
import type { PostDetail } from "./types";

export function Avatar({ src, className }: { src: string | null; className: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
  ) : (
    <div className={`${className} shrink-0 rounded-full bg-surface`} />
  );
}

// 글 본문 카드 — 작성자·본문·인용·반응 행 (page.tsx에서 분리, 핸들러는 page가 소유)
export default function PostCard({
  post,
  original,
  userId,
  reactionError,
  onReactionChange,
  onReactionError,
  onRepost,
  onDelete,
}: {
  post: PostDetail;
  original: QuotedPost | null | undefined;
  userId: string;
  reactionError: string | null;
  onReactionChange: (next: ReactionState) => void;
  onReactionError: (message: string) => void;
  onRepost: () => void;
  onDelete: () => void;
}) {
  const isMine = userId === post.author_id;

  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <Link
        href={`/profile/${post.author_id}`}
        className="group flex w-fit max-w-full items-center gap-3"
      >
        <Avatar src={post.author_icon} className="h-10 w-10" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-fg-primary group-hover:underline">
              {post.author_nickname ?? "알 수 없음"}
            </span>
            {isMine && (
              <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
                나
              </span>
            )}
          </p>
          <p className="text-xs text-fg-muted">{relativeTime(post.created_at)}</p>
        </div>
      </Link>

      <p className="mt-4 whitespace-pre-wrap break-words text-base leading-relaxed text-fg-primary">
        {post.content}
      </p>
      {post.repost_of && <QuotedPostCard original={original} />}

      <div className="mt-4 flex items-center gap-5 border-t border-border pt-4">
        <ReactionButtons
          postId={post.id}
          userId={userId}
          state={{
            likeCount: post.like_count,
            dislikeCount: post.dislike_count,
            myReaction: post.my_reaction,
          }}
          onChange={onReactionChange}
          onError={onReactionError}
        />
        <button
          type="button"
          onClick={onRepost}
          className="text-xs font-medium text-fg-muted hover:text-fg-secondary"
        >
          리포스트
        </button>
        <span className="text-xs tabular-nums text-fg-muted">
          댓글 {post.comment_count}
        </span>
        {isMine && (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto text-xs font-medium text-fg-muted hover:text-danger"
          >
            삭제
          </button>
        )}
      </div>
      {reactionError && (
        <p className="mt-2 text-sm text-danger">{reactionError}</p>
      )}
    </section>
  );
}
