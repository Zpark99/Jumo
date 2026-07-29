"use client";

import { useState } from "react";

import { supabase } from "@/lib/supabase";

type Props = {
  followerId: string;
  targetUserId: string;
  isFollowing: boolean;
  disabled?: boolean;
  onChange: (isFollowing: boolean) => void;
  onError: (message: string) => void;
};

export default function FollowButton({
  followerId,
  targetUserId,
  isFollowing,
  disabled,
  onChange,
  onError,
}: Props) {
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    if (disabled || pending) return;

    const previous = isFollowing;
    const next = !previous;

    setPending(true);
    onChange(next);

    // follows에는 update 정책이 없어(#26 반응과 동일한 이유) delete/insert로 토글한다.
    const { error } = previous
      ? await supabase
          .from("follows")
          .delete()
          .eq("follower_id", followerId)
          .eq("following_id", targetUserId)
      : await supabase.from("follows").insert({
          follower_id: followerId,
          following_id: targetUserId,
        });

    if (error) {
      onChange(previous);
      onError(error.message);
    }

    setPending(false);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || pending}
      className={`flex h-9 items-center justify-center rounded-full px-5 text-sm font-medium transition-colors disabled:opacity-50 ${
        isFollowing
          ? "border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
          : "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
      }`}
    >
      {isFollowing ? "팔로잉" : "팔로우"}
    </button>
  );
}
