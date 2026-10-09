import { formatPrice, type Holding } from "./types";

export default function HoldingList({ holdings }: { holdings: Holding[] }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="text-sm font-medium text-fg-secondary">
        보유 종목
      </h2>

      {holdings.length === 0 ? (
        <p className="mt-4 text-sm text-fg-secondary">
          보유 중인 종목이 없습니다
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {holdings.map((h) => {
            const pnl =
              h.currentPrice !== null
                ? (h.currentPrice - h.avg_price) * h.quantity
                : null;
            const name = h.stocks?.name_ko ?? h.stocks?.name_en ?? h.stock_id;

            return (
              <li
                key={h.stock_id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium text-fg-primary">
                    {name}
                  </p>
                  <p className="text-xs text-fg-secondary">
                    {h.quantity}주 · 평단 {formatPrice(h.avg_price, h.currency)}
                  </p>
                </div>
                <p
                  className={
                    pnl === null
                      ? "text-sm text-fg-muted"
                      : pnl > 0
                        ? "text-sm font-medium text-price-up"
                        : pnl < 0
                          ? "text-sm font-medium text-price-down"
                          : "text-sm font-medium text-price-flat"
                  }
                >
                  {pnl !== null ? formatPrice(pnl, h.currency) : "-"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
