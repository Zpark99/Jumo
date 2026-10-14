"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import ProfileHeader from "@/components/ProfileHeader";

const MAX_NICKNAME_LENGTH = 20;
const MAX_BIO_LENGTH = 150;

const ICON_PRESETS = [
  { id: "zinc", label: "zinc", hex: "#3f3f46" },
  { id: "blue", label: "blue", hex: "#2563eb" },
  { id: "emerald", label: "emerald", hex: "#059669" },
  { id: "amber", label: "amber", hex: "#d97706" },
  { id: "violet", label: "violet", hex: "#7c3aed" },
  { id: "pink", label: "pink", hex: "#db2777" },
] as const;

function getInitial(nickname: string) {
  return Array.from(nickname.trim())[0] ?? "?";
}

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildIconDataUri(letter: string, bg: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="32" fill="${bg}"/>` +
    `<text x="32" y="42" font-family="system-ui, sans-serif" font-size="28" ` +
    `font-weight="600" fill="#ffffff" text-anchor="middle">${escapeXml(letter)}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

type SavedProfile = { nickname: string; bio: string; icon: string | null };

export default function MyPage() {
  const { user, loading: userLoading } = useSupabaseUser();

  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // 마지막으로 불러오거나 저장한 값 — "저장됨"·변경사항 안내 표시용 (저장 로직과 무관)
  const [saved, setSaved] = useState<SavedProfile | null>(null);

  useEffect(() => {
    if (userLoading || !user) return;
    const userId = user.id;

    let active = true;

    async function load() {
      setLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, nickname, icon, bio")
        .eq("id", userId)
        .maybeSingle();

      if (!active) return;

      if (error) {
        setLoadError(error.message);
      } else if (data) {
        setNickname(data.nickname);
        setBio(data.bio ?? "");
        setIcon(data.icon ?? null);
        setSaved({ nickname: data.nickname, bio: data.bio ?? "", icon: data.icon ?? null });
      }

      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [user, userLoading]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleSave = async () => {
    if (!user) return;

    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      setSaveError("닉네임을 입력해주세요");
      return;
    }
    if (trimmedNickname.length > MAX_NICKNAME_LENGTH) {
      setSaveError(`닉네임은 ${MAX_NICKNAME_LENGTH}자 이내로 입력해주세요`);
      return;
    }

    const trimmedBio = bio.trim();
    if (trimmedBio.length > MAX_BIO_LENGTH) {
      setSaveError(`소개는 ${MAX_BIO_LENGTH}자 이내로 입력해주세요`);
      return;
    }

    setSaving(true);
    setSaveError(null);

    const { error } = await supabase
      .from("profiles")
      .update({ nickname: trimmedNickname, bio: trimmedBio || null, icon })
      .eq("id", user.id);

    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    setNickname(trimmedNickname);
    setBio(trimmedBio);
    setSaved({ nickname: trimmedNickname, bio: trimmedBio, icon });
    setSaving(false);
    setToast("저장되었습니다");
  };

  const nicknameLength = nickname.trim().length;
  const bioLength = bio.trim().length;
  const dirty =
    saved !== null &&
    (nickname.trim() !== saved.nickname ||
      bio.trim() !== saved.bio ||
      icon !== saved.icon);
  const justSaved = toast !== null && !dirty;

  return (
    <div className="flex flex-1 flex-col bg-page px-4 py-6 sm:px-6 lg:py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6 break-keep">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">마이페이지</h1>
          <p className="mt-1 text-sm text-fg-secondary">
            닉네임·아이콘·소개는 피드와 랭킹, 공개 프로필에 표시됩니다
          </p>
        </div>

        {!userLoading && !user && (
          <section className="rounded-3xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-fg-secondary">
              마이페이지를 보려면 로그인이 필요합니다
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
            {loading ? (
              /* 스켈레톤 — 미리보기 + 편집 카드와 같은 배치 */
              <>
                <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
                  <div className="h-3.5 w-16 animate-pulse rounded bg-surface" />
                  <div className="mt-4 flex items-center gap-4">
                    <div className="h-16 w-16 animate-pulse rounded-full bg-surface" />
                    <div className="h-5 w-28 animate-pulse rounded bg-surface" />
                  </div>
                </section>
                <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
                  <div className="h-3.5 w-20 animate-pulse rounded bg-surface" />
                  <div className="mt-5 h-9 w-64 max-w-full animate-pulse rounded-full bg-surface" />
                  <div className="mt-6 h-10 w-full animate-pulse rounded-xl bg-surface" />
                  <div className="mt-4 h-24 w-full animate-pulse rounded-2xl bg-surface" />
                </section>
              </>
            ) : (
              <>
                {/* 미리보기 — 저장 전 입력값이 바로 반영된다. 공개 프로필 헤더와 같은 컴포넌트 */}
                <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-medium text-fg-secondary">
                      미리보기
                    </h2>
                    <Link
                      href={`/profile/${user.id}`}
                      className="text-xs font-medium text-fg-muted transition-colors hover:text-fg-secondary"
                    >
                      공개 프로필 보기 →
                    </Link>
                  </div>
                  <ProfileHeader
                    icon={icon}
                    nickname={nickname.trim() || "닉네임"}
                    bio={bio.trim() || null}
                    isMe
                    emptyBio="소개를 입력하면 여기에 표시됩니다"
                  />
                </section>

                <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
                  <h2 className="text-sm font-medium text-fg-secondary">
                    프로필 편집
                  </h2>

                  {loadError && (
                    <p className="mt-2 text-sm text-danger">{loadError}</p>
                  )}

                  {/* 아이콘 색 — 팔레트 hex는 profiles.icon에 구워지는 저장 데이터라 토큰화하지 않는다 (#66) */}
                  <div className="mt-5">
                    <p className="text-xs font-medium text-fg-secondary">
                      아이콘 색상
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2.5">
                      {ICON_PRESETS.map((preset) => {
                        const selected =
                          icon?.includes(encodeURIComponent(preset.hex)) ?? false;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            aria-label={`아이콘 색상 ${preset.label}`}
                            aria-pressed={selected}
                            onClick={() =>
                              setIcon(buildIconDataUri(getInitial(nickname), preset.hex))
                            }
                            className={`h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-card transition-all ${
                              selected
                                ? "ring-brand"
                                : "ring-transparent hover:ring-fg-muted"
                            }`}
                            style={{ backgroundColor: preset.hex }}
                          />
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-fg-muted">
                      아이콘 글자는 색을 고를 때의 닉네임 첫 글자로 정해집니다
                    </p>
                  </div>

                  {/* 닉네임 */}
                  <div className="mt-6">
                    <div className="flex items-baseline justify-between gap-3">
                      <label
                        htmlFor="mypage-nickname"
                        className="text-xs font-medium text-fg-secondary"
                      >
                        닉네임
                      </label>
                      <span
                        className={`text-xs tabular-nums ${
                          nicknameLength >= MAX_NICKNAME_LENGTH
                            ? "text-danger"
                            : "text-fg-muted"
                        }`}
                      >
                        {nicknameLength}/{MAX_NICKNAME_LENGTH}
                      </span>
                    </div>
                    <input
                      id="mypage-nickname"
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      maxLength={MAX_NICKNAME_LENGTH}
                      className="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-fg-primary outline-none focus:border-brand"
                    />
                  </div>

                  {/* 소개 */}
                  <div className="mt-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <label
                        htmlFor="mypage-bio"
                        className="text-xs font-medium text-fg-secondary"
                      >
                        소개 <span className="font-normal text-fg-muted">(선택)</span>
                      </label>
                      <span
                        className={`text-xs tabular-nums ${
                          bioLength >= MAX_BIO_LENGTH ? "text-danger" : "text-fg-muted"
                        }`}
                      >
                        {bioLength}/{MAX_BIO_LENGTH}
                      </span>
                    </div>
                    <textarea
                      id="mypage-bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="자기소개를 입력해주세요"
                      rows={3}
                      maxLength={MAX_BIO_LENGTH}
                      className="mt-1.5 w-full resize-none rounded-2xl border border-border bg-surface p-4 text-sm text-fg-primary outline-none focus:border-brand"
                    />
                  </div>

                  <div className="mt-5 flex items-center justify-end gap-3 border-t border-border pt-5">
                    {saveError ? (
                      <p className="mr-auto text-sm text-danger">{saveError}</p>
                    ) : (
                      dirty && (
                        <p className="mr-auto text-xs text-fg-muted">
                          저장하지 않은 변경사항이 있어요
                        </p>
                      )
                    )}
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className={`flex h-10 shrink-0 items-center justify-center rounded-full px-5 text-sm font-medium transition-colors disabled:opacity-50 ${
                        justSaved
                          ? "bg-success-tint text-success"
                          : "bg-brand text-white hover:bg-brand-pressed"
                      }`}
                    >
                      {saving ? "저장 중..." : justSaved ? "✓ 저장됨" : "저장"}
                    </button>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-success-tint px-4 py-2 text-sm font-medium text-success"
        >
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
