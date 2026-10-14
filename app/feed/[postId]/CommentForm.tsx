import { MAX_COMMENT_LENGTH } from "./types";

// 댓글·답글 입력 (page.tsx에서 분리, 검증·등록 로직은 page의 onSubmit)
export default function CommentForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  error,
  placeholder,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitting: boolean;
  error: string | null;
  placeholder: string;
  compact?: boolean;
}) {
  const length = value.trim().length;

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={compact ? 2 : 3}
        maxLength={MAX_COMMENT_LENGTH}
        className={`w-full resize-none border border-border bg-surface text-sm text-fg-primary outline-none transition-colors focus:border-brand ${
          compact ? "rounded-xl p-3" : "rounded-2xl p-4"
        }`}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span
          className={`text-xs tabular-nums ${
            length >= MAX_COMMENT_LENGTH ? "text-danger" : "text-fg-muted"
          }`}
        >
          {length}/{MAX_COMMENT_LENGTH}
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium text-fg-secondary transition-colors hover:bg-surface"
            >
              취소
            </button>
          )}
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className={`flex items-center justify-center rounded-full bg-brand font-medium text-white transition-colors hover:bg-brand-pressed disabled:opacity-50 ${
              compact ? "h-8 px-4 text-xs" : "h-9 px-5 text-sm"
            }`}
          >
            {submitting ? "등록 중..." : "등록"}
          </button>
        </div>
      </div>
      {error && (
        <p className={`mt-2 text-danger ${compact ? "text-xs" : "text-sm"}`}>
          {error}
        </p>
      )}
    </div>
  );
}
