"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, createChart } from "lightweight-charts";

import type { Candle } from "@/app/api/candles/[stockId]/route";

type Props = {
  candles: Candle[];
  currency: string;
};

// KIS 날짜 "YYYYMMDD" → lightweight-charts time "yyyy-mm-dd"
function toChartTime(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

export default function CandleChart({ candles, currency }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;

    // 현재 테마의 토큰값을 런타임에 읽음 (다크모드별 hex가 다름)
    const css = getComputedStyle(el);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const priceUp = token("--color-price-up"); // 양봉 빨강(한국식)
    const priceDown = token("--color-price-down"); // 음봉 파랑
    const border = token("--color-border");
    const textColor = token("--color-text-secondary");

    const digits = currency === "USD" ? 2 : 0;
    const nf = new Intl.NumberFormat(currency === "USD" ? "en-US" : "ko-KR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

    const chart = createChart(el, {
      autoSize: true, // 컨테이너 크기에 ResizeObserver로 자동 대응
      layout: { background: { color: "transparent" }, textColor },
      grid: {
        vertLines: { color: border },
        horzLines: { color: border },
      },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border },
      localization: { priceFormatter: (p: number) => nf.format(p) },
    });

    // v5 문법: addSeries(CandlestickSeries, options) — 구버전 addCandlestickSeries() 아님
    const series = chart.addSeries(CandlestickSeries, {
      upColor: priceUp,
      wickUpColor: priceUp,
      downColor: priceDown,
      wickDownColor: priceDown,
      borderVisible: false,
    });

    series.setData(
      candles.map((c) => ({
        time: toChartTime(c.date),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    chart.timeScale().fitContent();

    return () => {
      chart.remove(); // canvas 생명주기 정리 (누락 시 메모리 누수)
    };
  }, [candles, currency]);

  return <div ref={containerRef} className="h-full w-full" />;
}
