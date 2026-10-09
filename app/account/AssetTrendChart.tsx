"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, createChart, type AutoscaleInfo } from "lightweight-charts";

import type { AssetSnapshot } from "./types";

// 선 하나를 그리려면 최소 2점이 필요하다. 그 전(신규 가입자)은 안내 문구.
const MIN_POINTS = 2;

// 값이 전부 같으면(거래 없는 기간) 자동 스케일 폭이 1원 미만이 되어 y축 눈금이
// 모두 같은 숫자로 찍힌다. 최소 ±0.5% 폭을 확보해 평평한 선이 중앙에 오게 한다.
function withMinSpan(original: () => AutoscaleInfo | null): AutoscaleInfo | null {
  const res = original();
  if (!res?.priceRange) return res;
  const { minValue, maxValue } = res.priceRange;
  const mid = (minValue + maxValue) / 2;
  const half = Math.abs(mid) * 0.005;
  if (maxValue - minValue >= half * 2) return res;
  return { ...res, priceRange: { minValue: mid - half, maxValue: mid + half } };
}

export default function AssetTrendChart({
  snapshots,
}: {
  snapshots: AssetSnapshot[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const enough = snapshots.length >= MIN_POINTS;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enough) return;

    // 현재 테마의 토큰값을 런타임에 읽음 (다크모드별 hex가 다름)
    const css = getComputedStyle(el);
    const token = (name: string) => css.getPropertyValue(name).trim();
    // 색은 헤더와 같은 규칙: 최신 수익률 부호로 한국식 이익 빨강 / 손실 파랑 / 0 회색
    const rate = snapshots[snapshots.length - 1].return_rate;
    const color = token(
      rate > 0 ? "--color-price-up" : rate < 0 ? "--color-price-down" : "--color-price-flat"
    );
    const border = token("--color-border");
    const textColor = token("--color-text-muted");

    const nf = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor },
      grid: {
        vertLines: { color: border },
        horzLines: { color: border },
      },
      rightPriceScale: { borderColor: border, scaleMargins: { top: 0.2, bottom: 0.1 } },
      timeScale: { borderColor: border },
      localization: { priceFormatter: (p: number) => nf.format(p) },
      // 요약 차트라 드래그·줌을 끈다. 모바일에서 세로 스크롤이 차트에 먹히지 않게.
      handleScroll: false,
      handleScale: false,
    });

    // v5 문법: addSeries(AreaSeries, options)
    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      lineWidth: 2,
      topColor: `${color}40`, // hex alpha 25%
      bottomColor: `${color}00`,
      priceLineVisible: false,
      autoscaleInfoProvider: withMinSpan,
    });

    series.setData(
      snapshots.map((s) => ({ time: s.snapshot_date, value: s.total_value_krw }))
    );
    chart.timeScale().fitContent();

    return () => {
      chart.remove(); // canvas 생명주기 정리 (구독 없음)
    };
  }, [snapshots, enough]);

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-fg-secondary">
          원화 평가금액 추이
        </h2>
        {enough && (
          <p className="text-xs text-fg-muted">
            매일 00:00 기준 · {snapshots.length}일
          </p>
        )}
      </div>

      {enough ? (
        // absolute로 부모 크기에 종속 → 캔버스 폭이 grid 1fr 컬럼을 밀어내지 않음 (CandleChart 패턴)
        <div className="relative mt-4 h-48">
          <div ref={containerRef} className="absolute inset-0" />
        </div>
      ) : (
        <p className="mt-4 text-sm text-fg-secondary">
          데이터 집계 중 — 이틀 이상 쌓이면 추이가 표시됩니다
        </p>
      )}
    </section>
  );
}
