import type { ReactNode } from "react";

// 공개 프로필 헤더와 마이페이지 미리보기가 같은 모양을 쓴다 (#147)
export default function ProfileHeader({
  icon,
  nickname,
  bio,
  isMe = false,
  emptyBio,
  action,
}: {
  icon: string | null;
  nickname: string;
  bio: string | null;
  isMe?: boolean;
  emptyBio?: string;
  action?: ReactNode;
}) {
  return (
    <>
      <div className="flex items-center gap-4">
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={icon}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-full bg-surface" />
        )}
        <p className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-lg font-semibold text-fg-primary">
            {nickname}
          </span>
          {isMe && (
            <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
              나
            </span>
          )}
        </p>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {bio ? (
        <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-secondary">
          {bio}
        </p>
      ) : (
        emptyBio && <p className="mt-4 text-sm text-fg-muted">{emptyBio}</p>
      )}
    </>
  );
}
