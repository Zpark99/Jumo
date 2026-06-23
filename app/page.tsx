"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-16 py-32 text-center">
        <h1 className="text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
          주모, 모의투자 플랫폼
        </h1>
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          실제 시세로 안전하게 모의투자를 연습해보세요.
        </p>

        {!loading && user && (
          <p className="rounded-full bg-green-100 px-4 py-2 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            {user.email}님, 로그인되었습니다.
          </p>
        )}

        {!loading && !user && (
          <Link
            href="/login"
            className="flex h-12 items-center justify-center rounded-full bg-zinc-950 px-8 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            로그인
          </Link>
        )}
      </main>
    </div>
  );
}
