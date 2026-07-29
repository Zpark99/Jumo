import Link from "next/link";

import { relativeTime } from "@/lib/relativeTime";

export type QuotedPost = {
  id: string;
  content: string;
  created_at: string;
  author_nickname: string | null;
  author_icon: string | null;
  repost_of: string | null;
};

// original === undefined: 아직 조회 중, null: 삭제됨(또는 조회 실패)
export default function QuotedPostCard({
  original,
}: {
  original: QuotedPost | null | undefined;
}) {
  if (original === undefined) {
    return (
      <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-500">
        원글 불러오는 중...
      </div>
    );
  }

  if (original === null) {
    return (
      <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-500">
        삭제된 글입니다
      </div>
    );
  }

  return (
    <Link
      href={`/feed/${original.id}`}
      className="mt-3 block rounded-2xl border border-zinc-200 bg-zinc-50 p-3 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-black dark:hover:bg-zinc-900"
    >
      <div className="flex items-center gap-2">
        {original.author_icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={original.author_icon}
            alt=""
            className="h-5 w-5 rounded-full object-cover"
          />
        )}
        <span className="text-xs font-medium text-zinc-950 dark:text-zinc-50">
          {original.author_nickname ?? "알 수 없음"}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          · {relativeTime(original.created_at)}
        </span>
      </div>
      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300">
        {original.content}
      </p>
      {original.repost_of && (
        <span className="mt-1 inline-block text-xs font-medium text-zinc-500 underline dark:text-zinc-400">
          원글 보기 →
        </span>
      )}
    </Link>
  );
}
