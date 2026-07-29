"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import FollowButton from "@/components/FollowButton";

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
    <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            프로필
          </h1>
          <Link
            href="/feed"
            className="text-sm font-medium text-zinc-600 underline hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            피드로
          </Link>
        </div>

        {!userLoading && !user && (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              프로필을 보려면 로그인이 필요합니다
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              로그인
            </Link>
          </section>
        )}

        {!userLoading && user && (
          <>
            {loadError && <p className="text-sm text-red-500">{loadError}</p>}

            {loading ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                불러오는 중...
              </p>
            ) : !profile ? (
              <p className="rounded-3xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                사용자를 찾을 수 없습니다
              </p>
            ) : (
              <>
                {/* 프로필 헤더 */}
                <section className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      {profile.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profile.icon}
                          alt=""
                          className="h-16 w-16 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-full bg-zinc-100 dark:bg-zinc-800" />
                      )}
                      <div>
                        <p className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                          {profile.nickname}
                        </p>
                        {profile.bio && (
                          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                            {profile.bio}
                          </p>
                        )}
                      </div>
                    </div>

                    {isOwnProfile ? (
                      <Link
                        href="/mypage"
                        className="flex h-9 items-center justify-center rounded-full border border-zinc-200 px-5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
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
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
                    <span>
                      팔로워{" "}
                      <span className="font-medium text-zinc-950 dark:text-zinc-50">
                        {followerCount}
                      </span>
                    </span>
                    <span>
                      팔로잉{" "}
                      <span className="font-medium text-zinc-950 dark:text-zinc-50">
                        {followingCount}
                      </span>
                    </span>
                  </div>

                  {followError && (
                    <p className="mt-2 text-sm text-red-500">{followError}</p>
                  )}
                </section>

                {/* 작성 글 목록 */}
                <section className="space-y-3">
                  <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    작성한 글
                  </h2>

                  {posts.length === 0 ? (
                    <p className="rounded-3xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                      작성한 글이 없습니다
                    </p>
                  ) : (
                    <ul className="divide-y divide-zinc-100 rounded-3xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
                      {posts.map((post) => (
                        <li
                          key={post.id}
                          className="px-6 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        >
                          <Link href={`/feed/${post.id}`} className="block">
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">
                              {relativeTime(post.created_at)}
                            </span>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
                              {post.content}
                            </p>
                            <div className="mt-3 flex items-center gap-4 text-xs text-zinc-400 dark:text-zinc-500">
                              <span>
                                좋아요 {post.like_count} · 비추 {post.dislike_count}
                              </span>
                              <span>댓글 {post.comment_count}</span>
                            </div>
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
