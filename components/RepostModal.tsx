"use client";

import { useState } from "react";

import { relativeTime } from "@/lib/relativeTime";

const MAX_REPOST_LENGTH = 500;

export type RepostOriginal = {
  id: string;
  content: string;
  author_nickname: string | null;
  author_icon: string | null;
  created_at: string;
};

type Props = {
  original: RepostOriginal;
  onClose: () => void;
  onSubmit: (comment: string) => Promise<{ error: string | null }>;
};

export default function RepostModal({ original, onClose, onSubmit }: Props) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = comment.trim();
    if (!trimmed) {
      setError("내용을 입력해주세요");
      return;
    }
    if (trimmed.length > MAX_REPOST_LENGTH) {
      setError(`${MAX_REPOST_LENGTH}자 이내로 작성해주세요`);
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: submitError } = await onSubmit(trimmed);
    if (submitError) {
      setError(submitError);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold text-fg-primary">
          리포스트
        </h3>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="코멘트를 입력하세요"
          rows={3}
          className="mt-4 w-full resize-none rounded-2xl border border-border bg-surface p-4 text-sm text-fg-primary outline-none focus:border-brand"
        />
        <div className="mt-2 flex items-center justify-between">
          <span
            className={`text-xs ${
              comment.trim().length > MAX_REPOST_LENGTH
                ? "text-red-500"
                : "text-fg-muted"
            }`}
          >
            {comment.trim().length}/{MAX_REPOST_LENGTH}
          </span>
        </div>

        <div className="mt-3 rounded-2xl border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            {original.author_icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={original.author_icon}
                alt=""
                className="h-5 w-5 rounded-full object-cover"
              />
            )}
            <span className="text-xs font-medium text-fg-primary">
              {original.author_nickname ?? "알 수 없음"}
            </span>
            <span className="text-xs text-fg-muted">
              · {relativeTime(original.created_at)}
            </span>
          </div>
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-fg-secondary">
            {original.content}
          </p>
        </div>

        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-full border border-border py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-full bg-brand py-2 text-sm font-medium text-white transition-colors hover:bg-brand-pressed disabled:opacity-50"
          >
            {submitting ? "등록 중..." : "리포스트"}
          </button>
        </div>
      </div>
    </div>
  );
}
