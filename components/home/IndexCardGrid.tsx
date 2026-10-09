import ExampleBadge from "@/components/ExampleBadge";

export type MarketIndex = {
  id: string;
  name: string;
  value: number;
  decimals: number;
  change: number; // 전일 대비 절대값
  changePct: number; // 전일 대비 %
  spark: number[]; // 미니 스파크라인용 포인트(결정적)
};

// 목업 지수 — 2026 기준 도메인상 말 되는 수치를 결정적으로 생성(렌더마다 안 흔들림).
// UI ↔ 데이터 분리: 나중에 지수 API 응답을 IndexCardGrid에 그대로 넘기면 됨.
export function buildMockIndices(): MarketIndex[] {
  return [
    { id: "kospi", name: "코스피", value: 2612.34, decimals: 2, change: 14.21, changePct: 0.55,
      spark: [2585, 2590, 2582, 2598, 2605, 2600, 2611, 2608, 2615, 2612] },
    { id: "kosdaq", name: "코스닥", value: 748.12, decimals: 2, change: -5.33, changePct: -0.71,
      spark: [758, 755, 752, 756, 750, 747, 745, 749, 746, 748] },
    { id: "nasdaq", name: "나스닥", value: 18492.6, decimals: 1, change: 102.4, changePct: 0.56,
      spark: [18350, 18410, 18380, 18450, 18500, 18470, 18520, 18480, 18510, 18493] },
    { id: "snp500", name: "S&P 500", value: 5804.9, decimals: 1, change: -12.8, changePct: -0.22,
      spark: [5825, 5818, 5822, 5810, 5805, 5815, 5800, 5808, 5802, 5805] },
    { id: "usdkrw", name: "원/달러", value: 1384.5, decimals: 1, change: 6.2, changePct: 0.45,
      spark: [1376, 1379, 1377, 1381, 1383, 1380, 1385, 1382, 1386, 1385] },
    { id: "btc", name: "비트코인", value: 95320000, decimals: 0, change: -1240000, changePct: -1.28,
      spark: [97200000, 96800000, 97000000, 96200000, 95800000, 96100000, 95400000, 95700000, 95100000, 95320000] },
  ];
}

// 한국식: 상승 price-up(빨강) / 하락 price-down(파랑) / 보합 price-flat (#52)
function changeColor(change: number) {
  return change > 0 ? "text-price-up" : change < 0 ? "text-price-down" : "text-price-flat";
}
function strokeColor(change: number) {
  return change > 0
    ? "var(--color-price-up)"
    : change < 0
      ? "var(--color-price-down)"
      : "var(--color-price-flat)";
}

// 미니 스파크라인 — inline SVG polyline(라이브러리 없음). 값 범위를 0~100 뷰박스에 정규화.
function Sparkline({ points, change }: { points: number[]; change: number }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = points.length > 1 ? 100 / (points.length - 1) : 0;
  const d = points
    .map((p, i) => `${(i * step).toFixed(1)},${(100 - ((p - min) / range) * 100).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-8 w-full"
      aria-hidden
    >
      <polyline
        points={d}
        fill="none"
        stroke={strokeColor(change)}
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function IndexCard({ index }: { index: MarketIndex }) {
  const color = changeColor(index.change);
  const sign = index.change > 0 ? "+" : "";
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs font-medium text-fg-secondary">{index.name}</p>
      <p className="mt-1 text-lg font-semibold text-fg-primary">
        {index.value.toLocaleString(undefined, {
          minimumFractionDigits: index.decimals,
          maximumFractionDigits: index.decimals,
        })}
      </p>
      <p className={`text-xs font-medium ${color}`}>
        {sign}
        {index.change.toLocaleString(undefined, {
          minimumFractionDigits: index.decimals,
          maximumFractionDigits: index.decimals,
        })}{" "}
        ({sign}
        {index.changePct.toFixed(2)}%)
      </p>
      <div className="mt-2">
        <Sparkline points={index.spark} change={index.change} />
      </div>
    </div>
  );
}

type Props = {
  indices: MarketIndex[];
  isExample?: boolean; // 목업을 넘길 때 true → "예시" 배지
};

// 지수 카드 그리드. 순수 표시 컴포넌트 — 데이터는 props로 받음(목업/실시간 무관).
export default function IndexCardGrid({ indices, isExample = false }: Props) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-fg-secondary">지수</h2>
        {isExample && <ExampleBadge />}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {indices.map((index) => (
          <IndexCard key={index.id} index={index} />
        ))}
      </div>
    </section>
  );
}
