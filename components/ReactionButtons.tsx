"use client";

import { useState } from "react";

import { supabase } from "@/lib/supabase";

export type ReactionType = "like" | "dislike";

export type ReactionState = {
  likeCount: number;
  dislikeCount: number;
  myReaction: ReactionType | null;
};

type Props = {
  postId: string;
  userId: string | undefined;
  state: ReactionState;
  disabled?: boolean;
  onChange: (next: ReactionState) => void;
  onError: (message: string) => void;
};

// 취소/전환/신규 반응에 따른 다음 카운트+내 반응 상태 계산
function nextStateFor(current: ReactionState, clicked: ReactionType): ReactionState {
  let { likeCount, dislikeCount } = current;

  if (current.myReaction === "like") likeCount -= 1;
  if (current.myReaction === "dislike") dislikeCount -= 1;

  const myReaction = current.myReaction === clicked ? null : clicked;
  if (myReaction === "like") likeCount += 1;
  if (myReaction === "dislike") dislikeCount += 1;

  return { likeCount, dislikeCount, myReaction };
}

export default function ReactionButtons({
  postId,
  userId,
  state,
  disabled,
  onChange,
  onError,
}: Props) {
  const [pending, setPending] = useState(false);

  const handleClick = async (clicked: ReactionType) => {
    if (disabled || pending || !userId) return;

    const previous = state;
    const next = nextStateFor(previous, clicked);
    // 기존 반응만 취소된(신규 반응 없는) 중간 상태 - insert 실패 시 롤백 지점
    const afterCancelOnly = nextStateFor(previous, previous.myReaction ?? clicked);

    setPending(true);
    onChange(next);

    if (previous.myReaction !== null) {
      const { error: deleteError } = await supabase
        .from("post_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);

      if (deleteError) {
        onChange(previous);
        onError(deleteError.message);
        setPending(false);
        return;
      }
    }

    if (next.myReaction !== null) {
      const { error: insertError } = await supabase.from("post_reactions").insert({
        post_id: postId,
        user_id: userId,
        type: next.myReaction,
      });

      if (insertError) {
        onChange(previous.myReaction === null ? previous : afterCancelOnly);
        onError(insertError.message);
        setPending(false);
        return;
      }
    }

    setPending(false);
  };

  const isLike = state.myReaction === "like";
  const isDislike = state.myReaction === "dislike";

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={() => handleClick("like")}
        disabled={disabled || pending}
        className={`relative rounded-full px-2 py-1 font-medium transition-colors before:absolute before:-inset-1 before:content-[''] disabled:opacity-50 ${
          isLike
            ? "bg-brand text-white"
            : "text-fg-muted hover:bg-surface"
        }`}
      >
        좋아요 {state.likeCount}
      </button>
      <button
        type="button"
        onClick={() => handleClick("dislike")}
        disabled={disabled || pending}
        className={`relative rounded-full px-2 py-1 font-medium transition-colors before:absolute before:-inset-1 before:content-[''] disabled:opacity-50 ${
          isDislike
            ? "bg-brand text-white"
            : "text-fg-muted hover:bg-surface"
        }`}
      >
        비추 {state.dislikeCount}
      </button>
    </div>
  );
}
