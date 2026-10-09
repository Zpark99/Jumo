import { formatPrice, type AssetSnapshot } from "./types";

function formatPct(rate: number) {
  return `${rate > 0 ? "+" : ""}${(rate * 100).toFixed(2)}%`;
}

// 한국식: 이익 price-up(빨강) / 손실 price-down(파랑) / 보합 flat (#52)
function rateColor(rate: number) {
  return rate > 0 ? "text-price-up" : rate < 0 ? "text-price-down" : "text-price-flat";
}

// 스냅샷 적재 시각을 KST "YYYY-MM-DD HH:mm"로. sv-SE 로캘이 ISO 형태를 낸다.
// cron 행은 00:00, 계좌 생성 트리거 행은 가입 시각이 그대로 찍힌다.
function formatBasis(createdAt: string) {
  return new Date(createdAt)
    .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
    .slice(0, 16);
}

export default function AccountHeader({
  ready,
  snapshot,
}: {
  ready: boolean;
  snapshot: AssetSnapshot | null;
}) {
  return (
    <>
      <h1 className="text-xl font-semibold text-fg-primary">
        내 계좌
      </h1>

      {ready && (
        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex items-baseline justify-between gap-4">
            {/* USD 현금·종목은 집계에 없어 "총" 평가금액이 아니다 (USD는 현금 잔고 카드) */}
            <h2 className="text-sm font-medium text-fg-secondary">
              원화 평가금액
            </h2>
            {snapshot && (
              <p className="text-xs text-fg-muted">
                {formatBasis(snapshot.created_at)} 기준
              </p>
            )}
          </div>

          {snapshot ? (
            <>
              <p className="mt-3 text-3xl font-semibold tabular-nums text-fg-primary">
                {formatPrice(snapshot.total_value_krw, "KRW")}
              </p>
              <p
                className={`mt-1 text-sm font-medium tabular-nums ${rateColor(snapshot.return_rate)}`}
              >
                {snapshot.pnl_krw > 0 ? "+" : ""}
                {formatPrice(snapshot.pnl_krw, "KRW")} ({formatPct(snapshot.return_rate)})
                <span className="ml-1.5 text-xs font-normal text-fg-muted">
                  시드 대비
                </span>
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-fg-secondary">
              집계 준비 중 — 매일 00:00에 집계됩니다
            </p>
          )}
        </section>
      )}
    </>
  );
}
