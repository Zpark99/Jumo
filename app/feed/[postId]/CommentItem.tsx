import type { ReactNode } from "react";
import Link from "next/link";

import { relativeTime } from "@/lib/relativeTime";
import { Avatar } from "./PostCard";
import type { CommentNode, CommentRow } from "./types";

function CommentBody({
  comment,
  isPostAuthor,
}: {
  comment: CommentRow;
  isPostAuthor: boolean;
}) {
  return (
    <>
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
        <Link
          href={`/profile/${comment.author_id}`}
          className="text-sm font-medium text-fg-primary hover:underline"
        >
          {comment.author_nickname ?? "알 수 없음"}
        </Link>
        {isPostAuthor && (
          <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold text-brand">
            작성자
          </span>
        )}
        <span className="text-fg-muted">· {relativeTime(comment.created_at)}</span>
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-primary">
        {comment.content}
      </p>
    </>
  );
}

// 최상위 댓글 + 1단계 대댓글 스레드 (page.tsx에서 분리, 핸들러는 page가 소유)
export default function CommentItem({
  node,
  userId,
  postAuthorId,
  replyForm,
  onReply,
  onDelete,
}: {
  node: CommentNode;
  userId: string;
  postAuthorId: string;
  replyForm: ReactNode;
  onReply: () => void;
  onDelete: (commentId: string) => void;
}) {
  return (
    <li className="flex gap-3 px-5 py-4 sm:px-6">
      <Link href={`/profile/${node.author_id}`} className="shrink-0">
        <Avatar src={node.author_icon} className="h-8 w-8" />
      </Link>
      <div className="min-w-0 flex-1">
        <CommentBody comment={node} isPostAuthor={node.author_id === postAuthorId} />
        <div className="mt-1.5 flex gap-3 text-xs text-fg-muted">
          <button
            type="button"
            onClick={onReply}
            className="tap font-medium hover:text-fg-secondary"
          >
            답글
          </button>
          {userId === node.author_id && (
            <button
              type="button"
              onClick={() => onDelete(node.id)}
              className="tap font-medium hover:text-danger"
            >
              삭제
            </button>
          )}
        </div>

        {replyForm && <div className="mt-3">{replyForm}</div>}

        {/* 대댓글 — 왼쪽 연결선으로 스레드 구분 */}
        {node.replies.length > 0 && (
          <ul className="mt-3 space-y-3 border-l-2 border-border pl-4">
            {node.replies.map((reply) => (
              <li key={reply.id} className="flex gap-2.5">
                <Link href={`/profile/${reply.author_id}`} className="shrink-0">
                  <Avatar src={reply.author_icon} className="h-6 w-6" />
                </Link>
                <div className="min-w-0 flex-1">
                  <CommentBody
                    comment={reply}
                    isPostAuthor={reply.author_id === postAuthorId}
                  />
                  {userId === reply.author_id && (
                    <div className="mt-1.5 flex gap-3 text-xs text-fg-muted">
                      <button
                        type="button"
                        onClick={() => onDelete(reply.id)}
                        className="tap font-medium hover:text-danger"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
