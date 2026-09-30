"use client";

import Link from "next/link";

import { useSupabaseUser } from "@/lib/useSupabaseUser";
import PostFeed from "@/components/PostFeed";

export default function FeedPage() {
  const { user, loading: userLoading } = useSupabaseUser();

  return (
    <div className="flex flex-1 flex-col bg-page px-6 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-fg-primary">
            피드
          </h1>
          <Link
            href="/"
            className="text-sm font-medium text-fg-secondary underline hover:text-fg-primary"
          >
            홈으로
          </Link>
        </div>

        {!userLoading && !user && (
          <section className="rounded-3xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-fg-secondary">
              피드를 보려면 로그인이 필요합니다
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
          <PostFeed userId={user.id} table="feed_posts" stockId={null} />
        )}
      </div>
    </div>
  );
}
