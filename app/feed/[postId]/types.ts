// 글 상세 공유 타입·상수 (page.tsx에서 분리, 로직 변경 없음 — #146)
import type { ReactionType } from "@/components/ReactionButtons";

export type PostDetail = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_nickname: string | null;
  author_icon: string | null;
  like_count: number;
  dislike_count: number;
  comment_count: number;
  my_reaction: ReactionType | null;
  repost_of: string | null;
};

export type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
  author_nickname: string | null;
  author_icon: string | null;
};

export type CommentNode = CommentRow & { replies: CommentRow[] };

export const MAX_COMMENT_LENGTH = 300;

// 최상위 댓글(parent_comment_id null) 아래에 대댓글을 1단계만 붙인다.
// rows는 created_at asc로 정렬되어 들어오므로 순서가 그대로 유지된다.
export function buildCommentTree(rows: CommentRow[]): CommentNode[] {
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
