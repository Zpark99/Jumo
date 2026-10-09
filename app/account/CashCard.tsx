import { formatPrice, type Account } from "./types";

export default function CashCard({ account }: { account: Account | null }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="text-sm font-medium text-fg-secondary">
        현금 잔고
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-fg-secondary">KRW</p>
          <p className="text-lg font-semibold text-fg-primary">
            {formatPrice(account?.cash_krw ?? 0, "KRW")}
          </p>
        </div>
        <div>
          <p className="text-xs text-fg-secondary">USD</p>
          <p className="text-lg font-semibold text-fg-primary">
            {formatPrice(account?.cash_usd ?? 0, "USD")}
          </p>
        </div>
      </div>
    </section>
  );
}
