"use client";

import { useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
    <path d="M3.06364 7.50914C4.70909 4.24092 8.09084 2 12 2C14.6954 2 16.959 2.99095 18.6909 4.60455L15.8227 7.47274C14.7864 6.48185 13.4681 5.97727 12 5.97727C9.39542 5.97727 7.19084 7.73637 6.40455 10.1C6.2045 10.7 6.09086 11.3409 6.09086 12C6.09086 12.6591 6.2045 13.3 6.40455 13.9C7.19084 16.2636 9.39542 18.0227 12 18.0227C13.3454 18.0227 14.4909 17.6682 15.3864 17.0682C16.4454 16.3591 17.15 15.3 17.3818 14.05H12V10.1818H21.4181C21.5364 10.8363 21.6 11.5182 21.6 12.2273C21.6 15.2727 20.5091 17.8363 18.6181 19.5773C16.9636 21.1046 14.7 22 12 22C8.09084 22 4.70909 19.7591 3.06364 16.4909C2.38638 15.1409 2 13.6136 2 12C2 10.3864 2.38638 8.85911 3.06364 7.50914Z" />
  </svg>
);

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  // TopNav가 숨겨진 화면(#104)이라 워드마크·"홈 둘러보기"가 유일한 탈출구
  return (
    <div className="flex flex-1 items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card px-6 py-10">
        <div className="flex flex-col items-center space-y-8 text-center break-keep">
          <div className="space-y-2">
            <h1>
              <Link href="/" className="text-4xl font-bold text-brand">
                주모
              </Link>
            </h1>
            <p className="text-sm text-fg-secondary">
              국내 주식 모의투자 + 소셜
            </p>
          </div>

          <div className="w-full space-y-3">
            {/* 구글 브랜딩 가이드: 브랜드색으로 칠하지 않은 중립 버튼 유지 (#72) */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-fg-primary transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-50"
            >
              <GoogleIcon className="size-4" />
              {loading ? "이동 중..." : "Google로 계속하기"}
            </button>

            {error && <p className="text-sm text-danger">{error}</p>}
          </div>

          <p className="text-xs text-fg-secondary">
            시세는 로그인 없이도 볼 수 있어요{" "}
            <Link href="/" className="font-medium text-brand hover:underline">
              홈 둘러보기
            </Link>
          </p>

          <p className="border-t border-border pt-6 text-xs text-fg-muted">
            가상 자금으로 거래하는 모의투자 서비스로, 실제 돈이 오가지 않습니다.
            <br />
            <Link href="/privacy" className="underline hover:text-fg-primary">
              개인정보처리방침
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
