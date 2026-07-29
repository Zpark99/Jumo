"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

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
    setSaving(false);
    setToast("저장되었습니다");
  };

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            마이페이지
          </h1>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 underline hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            홈으로
          </Link>
        </div>

        {!userLoading && !user && (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              마이페이지를 보려면 로그인이 필요합니다
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
            {loading ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                불러오는 중...
              </p>
            ) : (
              <section className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  프로필 편집
                </h2>

                {loadError && (
                  <p className="mt-2 text-sm text-red-500">{loadError}</p>
                )}

                {/* 아이콘 */}
                <div className="mt-4 flex items-center gap-4">
                  {icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={icon}
                      alt=""
                      className="h-16 w-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-zinc-100 dark:bg-zinc-800" />
                  )}
                  <div className="flex gap-2">
                    {ICON_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        aria-label={`아이콘 색상 ${preset.label}`}
                        onClick={() =>
                          setIcon(buildIconDataUri(getInitial(nickname), preset.hex))
                        }
                        className="h-8 w-8 rounded-full ring-2 ring-transparent transition-all hover:ring-zinc-300 dark:hover:ring-zinc-600"
                        style={{ backgroundColor: preset.hex }}
                      />
                    ))}
                  </div>
                </div>

                {/* 닉네임 */}
                <div className="mt-6">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    닉네임
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={MAX_NICKNAME_LENGTH}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-950 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-600"
                  />
                  <div className="mt-1 flex justify-end">
                    <span
                      className={`text-xs ${
                        nickname.trim().length > MAX_NICKNAME_LENGTH
                          ? "text-red-500"
                          : "text-zinc-400 dark:text-zinc-500"
                      }`}
                    >
                      {nickname.trim().length}/{MAX_NICKNAME_LENGTH}
                    </span>
                  </div>
                </div>

                {/* 소개 */}
                <div className="mt-4">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    소개
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="자기소개를 입력해주세요 (선택)"
                    rows={3}
                    maxLength={MAX_BIO_LENGTH}
                    className="mt-1 w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-950 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-600"
                  />
                  <div className="mt-1 flex justify-end">
                    <span
                      className={`text-xs ${
                        bio.trim().length > MAX_BIO_LENGTH
                          ? "text-red-500"
                          : "text-zinc-400 dark:text-zinc-500"
                      }`}
                    >
                      {bio.trim().length}/{MAX_BIO_LENGTH}
                    </span>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  {saveError && (
                    <p className="mr-auto text-sm text-red-500">{saveError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex h-9 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  >
                    {saving ? "저장 중..." : "저장"}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-green-100 px-4 py-2 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          {toast}
        </div>
      )}
    </div>
  );
}
