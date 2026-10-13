import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 — 주모",
};

// 최소 고지(#149). 탈퇴 기능·문의 연락처는 v1.0에 없어 권리 행사 방법 항목은 두지 않음
const SECTIONS = [
  {
    title: "수집하는 항목",
    body: [
      "Google 로그인 시 Google 계정의 이메일 주소, 이름(닉네임으로 사용), 프로필 사진 주소를 받습니다.",
      "서비스 이용 중 모의투자 주문·보유·거래 내역과 작성한 글·댓글·반응이 저장됩니다.",
      "가상 자금만 사용하므로 결제·금융 정보는 수집하지 않습니다.",
    ],
  },
  {
    title: "이용 목적",
    body: [
      "로그인과 본인 식별, 모의투자 계좌 운영, 피드·랭킹·프로필 표시에만 사용합니다. 광고·마케팅 용도나 제3자 제공은 없습니다.",
    ],
  },
  {
    title: "다른 사용자에게 보이는 정보",
    body: [
      "닉네임, 프로필 사진, 작성한 글·댓글, 랭킹 수익률은 다른 로그인 사용자에게 표시됩니다. 이메일은 표시되지 않습니다.",
    ],
  },
  {
    title: "보관 기간",
    body: ["서비스를 운영하는 동안 보관하며, 서비스를 종료하면 지체 없이 파기합니다."],
  },
  {
    title: "처리 위탁",
    body: [
      "Supabase(데이터베이스·인증)와 Vercel(웹 호스팅)에 처리를 위탁하며, 정보가 국외 서버에서 처리될 수 있습니다.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col bg-page px-4 py-6 sm:px-6 lg:py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6 break-keep">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">개인정보처리방침</h1>
          <p className="mt-1 text-sm text-fg-secondary">시행일 2026-10-13</p>
        </div>

        <section className="space-y-6 rounded-3xl border border-border bg-card p-6">
          {SECTIONS.map((s) => (
            <div key={s.title} className="space-y-2">
              <h2 className="text-sm font-semibold text-fg-primary">{s.title}</h2>
              {s.body.map((line) => (
                <p key={line} className="text-sm leading-relaxed text-fg-secondary">
                  {line}
                </p>
              ))}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
