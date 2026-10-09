import { formatPrice, type Transaction } from "./types";

export default function TransactionList({
  transactions,
}: {
  transactions: Transaction[];
}) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="text-sm font-medium text-fg-secondary">
        최근 체결내역
      </h2>

      {transactions.length === 0 ? (
        <p className="mt-4 text-sm text-fg-secondary">
          체결 내역이 없습니다
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {transactions.map((t) => {
            const name = t.stocks?.name_ko ?? t.stocks?.name_en ?? t.stock_id;

            return (
              <li
                key={t.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium text-fg-primary">
                    {name}{" "}
                    <span className="text-fg-muted">
                      ({t.side === "buy" ? "매수" : "매도"})
                    </span>
                  </p>
                  <p className="text-xs text-fg-secondary">
                    {new Date(t.executed_at).toLocaleString("ko-KR")}
                  </p>
                </div>
                <p className="text-sm text-fg-primary">
                  {t.quantity}주 · {formatPrice(t.price, t.currency)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
