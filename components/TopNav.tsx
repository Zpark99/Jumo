"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

// 전역 내비를 숨길 경로 (로그인 화면 등)
const HIDDEN_PATHS = ["/login"];

type NavLink = { href: string; label: string };

const BASE_LINKS: NavLink[] = [
  { href: "/stocks", label: "종목" },
  { href: "/feed", label: "피드" },
  { href: "/ranking", label: "랭킹" },
];

const AUTHED_LINKS: NavLink[] = [
  { href: "/account", label: "내 계좌" },
  { href: "/mypage", label: "마이페이지" },
];

const linkClass =
  "text-sm font-medium text-fg-secondary transition-colors hover:text-fg-primary";

export default function TopNav() {
  const pathname = usePathname();
  const { user, loading } = useSupabaseUser();
  const [menuOpen, setMenuOpen] = useState(false);

  if (HIDDEN_PATHS.includes(pathname)) return null;

  const links = user ? [...BASE_LINKS, ...AUTHED_LINKS] : BASE_LINKS;
  const close = () => setMenuOpen(false);

  // 로그인/비로그인 variant의 액션 영역 (데스크탑·모바일 공용)
  function AuthAction() {
    if (loading) return null;
    if (user) {
      return (
        <button
          type="button"
          onClick={() => {
            close();
            supabase.auth.signOut();
          }}
          className={linkClass}
        >
          로그아웃
        </button>
      );
    }
    return (
      <Link
        href="/login"
        onClick={close}
        className="flex h-9 items-center justify-center rounded-full bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-pressed"
      >
        로그인
      </Link>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-page/90 backdrop-blur">
      <nav className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          onClick={close}
          className="text-lg font-bold text-brand"
        >
          주모
        </Link>

        {/* 데스크탑 (lg+) */}
        <div className="hidden items-center gap-6 lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass}>
              {l.label}
            </Link>
          ))}
          <AuthAction />
        </div>

        {/* 모바일 햄버거 (lg 미만) */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="메뉴 열기"
          aria-expanded={menuOpen}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-secondary hover:text-fg-primary lg:hidden"
        >
          <span className="text-xl leading-none">{menuOpen ? "✕" : "☰"}</span>
        </button>
      </nav>

      {/* 모바일 드롭다운 */}
      {menuOpen && (
        <div className="border-t border-border bg-page lg:hidden">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={close}
                className="rounded-lg px-2 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface hover:text-fg-primary"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 px-2">
              <AuthAction />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
