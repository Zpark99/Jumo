"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import FollowButton from "@/components/FollowButton";
import ProfileHeader from "@/components/ProfileHeader";

type Profile = {
  id: string;
  nickname: string;
  icon: string | null;
  bio: string | null;
};

type ProfilePost = {
  id: string;
  content: string;
  created_at: string;
  like_count: number;
  dislike_count: number;
  comment_count: number;
};

const POST_SELECT =
  "id, content, created_at, like_count, dislike_count, comment_count";

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "방금 전";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

async function fetchProfile(userId: string) {
  return supabase
    .from("profiles")
    .select("id, nickname, icon, bio")
    .eq("id", userId)
    .maybeSingle();
}

async function fetchFollowerCount(userId: string) {
  return supabase
    .from("follows")
    .select("follower_id", { count: "exact", head: true })
    .eq("following_id", userId);
}

async function fetchFollowingCount(userId: string) {
  return supabase
    .from("follows")
    .select("following_id", { count: "exact", head: true })
    .eq("follower_id", userId);
}

async function fetchIsFollowing(myId: string, targetId: string) {
  return supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", myId)
    .eq("following_id", targetId)
    .maybeSingle();
}

async function fetchUserPosts(userId: string) {
  return supabase
    .from("posts_with_author")
    .select(POST_SELECT)
    .eq("author_id", userId)
    .order("created_at", { ascending: false });
}

async function loadProfileData(userId: string, viewerId: string) {
  const isOwnProfile = viewerId === userId;

  const [profileResult, followerResult, followingResult, postsResult, isFollowingResult] =
    await Promise.all([
      fetchProfile(userId),
      fetchFollowerCount(userId),
      fetchFollowingCount(userId),
      fetchUserPosts(userId),
      isOwnProfile
        ? Promise.resolve({ data: null, error: null })
        : fetchIsFollowing(viewerId, userId),
    ]);

  return { profileResult, followerResult, followingResult, postsResult, isFollowingResult };
}

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const { user, loading: userLoading } = useSupabaseUser();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [followError, setFollowError] = useState<string | null>(null);

  const isOwnProfile = user?.id === userId;

  useEffect(() => {
    if (userLoading || !user) return;
    const viewerId = user.id;

    let active = true;

    async function load() {
      setLoading(true);
      setLoadError(null);

      const { profileResult, followerResult, followingResult, postsResult, isFollowingResult } =
        await loadProfileData(userId, viewerId);
      if (!active) return;

      if (profileResult.error) {
        setLoadError(profileResult.error.message);
      } else {
        setProfile(profileResult.data);
      }

      if (followerResult.error) {
        setLoadError(followerResult.error.message);
      } else {
        setFollowerCount(followerResult.count ?? 0);
      }

      if (followingResult.error) {
        setLoadError(followingResult.error.message);
      } else {
        setFollowingCount(followingResult.count ?? 0);
      }

      if (postsResult.error) {
        setLoadError(postsResult.error.message);
      } else {
        setPosts(postsResult.data ?? []);
      }

      if (isFollowingResult.error) {
        setLoadError(isFollowingResult.error.message);
      } else {
        setIsFollowing(!!isFollowingResult.data);
      }

      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [user, userLoading, userId]);

  const handleFollowChange = (next: boolean) => {
    setIsFollowing(next);
    setFollowerCount((c) => (next ? c + 1 : Math.max(0, c - 1)));
  };

  return (
    <div className="flex flex-1 flex-col bg-page px-4 py-6 sm:px-6 lg:py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6 break-keep">
        <h1 className="text-xl font-semibold text-fg-primary">프로필</h1>

        {!userLoading && !user && (
          <section className="rounded-3xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-fg-secondary">
              프로필을 보려면 로그인이 필요합니다
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
          <>
            {loadError && <p className="text-sm text-danger">{loadError}</p>}

            {loading ? (
              /* 스켈레톤 — 헤더 카드 + 글 3줄 */
              <>
                <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 animate-pulse rounded-full bg-surface" />
                    <div className="h-5 w-28 animate-pulse rounded bg-surface" />
                  </div>
                  <div className="mt-4 h-3.5 w-48 max-w-full animate-pulse rounded bg-surface" />
                  <div className="mt-5 grid grid-cols-3 border-t border-border pt-4">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="mx-auto h-10 w-14 animate-pulse rounded bg-surface" />
                    ))}
                  </div>
                </section>
                <section className="divide-y divide-border rounded-3xl border border-border bg-card">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="space-y-2 px-5 py-4 sm:px-6">
                      <div className="h-3 w-12 animate-pulse rounded bg-surface" />
                      <div className="h-3.5 w-full animate-pulse rounded bg-surface" />
                      <div className="h-3 w-32 animate-pulse rounded bg-surface" />
                    </div>
                  ))}
                </section>
              </>
            ) : !profile ? (
              <section className="rounded-3xl border border-border bg-card p-8 text-center">
                <p className="text-sm font-medium text-fg-primary">
                  사용자를 찾을 수 없습니다
                </p>
                <p className="mt-1 text-xs text-fg-muted">
                  주소가 잘못되었거나 없는 사용자입니다
                </p>
                <Link
                  href="/feed"
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-border px-5 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface"
                >
                  피드로 가기
                </Link>
              </section>
            ) : (
              <>
                {/* 프로필 헤더 — 마이페이지 미리보기와 같은 컴포넌트 */}
                <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
                  <ProfileHeader
                    icon={profile.icon}
                    nickname={profile.nickname}
                    bio={profile.bio}
                    isMe={isOwnProfile}
                    emptyBio={
                      isOwnProfile
                        ? "아직 소개가 없어요. 프로필 편집에서 추가할 수 있어요"
                        : undefined
                    }
                    action={
                      isOwnProfile ? (
                        <Link
                          href="/mypage"
                          className="flex h-9 items-center justify-center rounded-full border border-border px-4 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface"
                        >
                          프로필 편집
                        </Link>
                      ) : (
                        <FollowButton
                          followerId={user.id}
                          targetUserId={userId}
                          isFollowing={isFollowing}
                          onChange={handleFollowChange}
                          onError={setFollowError}
                        />
                      )
                    }
                  />

                  <dl className="mt-5 grid grid-cols-3 divide-x divide-border border-t border-border pt-4 text-center">
                    {(
                      [
                        ["작성한 글", posts.length],
                        ["팔로워", followerCount],
                        ["팔로잉", followingCount],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="flex flex-col-reverse gap-0.5">
                        <dt className="text-xs text-fg-secondary">{label}</dt>
                        <dd className="text-lg font-semibold tabular-nums text-fg-primary">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {followError && (
                    <p className="mt-3 text-sm text-danger">{followError}</p>
                  )}
                </section>

                {/* 작성 글 목록 */}
                <section className="overflow-hidden rounded-3xl border border-border bg-card">
                  <h2 className="px-5 py-4 text-sm font-medium text-fg-secondary sm:px-6">
                    작성한 글
                    <span className="ml-1.5 tabular-nums text-fg-muted">
                      {posts.length}
                    </span>
                  </h2>

                  {posts.length === 0 ? (
                    <div className="border-t border-border p-8 text-center">
                      <p className="text-sm font-medium text-fg-primary">
                        아직 작성한 글이 없습니다
                      </p>
                      {isOwnProfile ? (
                        <>
                          <p className="mt-1 text-xs text-fg-muted">
                            피드에서 첫 글을 남겨보세요
                          </p>
                          <Link
                            href="/feed"
                            className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-pressed"
                          >
                            피드로 가기
                          </Link>
                        </>
                      ) : (
                        <p className="mt-1 text-xs text-fg-muted">
                          글을 쓰면 여기에 표시됩니다
                        </p>
                      )}
                    </div>
                  ) : (
                    <ul className="divide-y divide-border border-t border-border">
                      {posts.map((post) => (
                        <li key={post.id}>
                          <Link
                            href={`/feed/${post.id}`}
                            className="block px-5 py-4 transition-colors hover:bg-surface sm:px-6"
                          >
                            <span className="text-xs text-fg-muted">
                              {relativeTime(post.created_at)}
                            </span>
                            <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-primary">
                              {post.content}
                            </p>
                            <p className="mt-3 flex items-center gap-3 text-xs tabular-nums text-fg-muted">
                              <span>좋아요 {post.like_count}</span>
                              <span>비추 {post.dislike_count}</span>
                              <span>댓글 {post.comment_count}</span>
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
