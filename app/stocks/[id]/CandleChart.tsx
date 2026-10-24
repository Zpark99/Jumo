"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type MouseEventParams,
} from "lightweight-charts";

import type { Candle } from "@/app/api/candles/[stockId]/route";
import { formatPrice } from "./types";

type Props = {
  candles: Candle[];
  currency: string;
};

type Legend = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

// KIS 날짜 "YYYYMMDD" → lightweight-charts time "yyyy-mm-dd"
function toChartTime(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

export default function CandleChart({ candles, currency }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // 크로스헤어가 가리키는 봉의 OHLC+거래량. 벗어나면 최신 봉으로 복귀.
  const [legend, setLegend] = useState<Legend | null>(null);

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
      autoSize: true, // 컨테이너 크기에 ResizeObserver로 자동 대응 (전체화면 전환 포함)
      layout: { background: { color: "transparent" }, textColor },
      grid: {
        vertLines: { color: border },
        horzLines: { color: border },
      },
      // 캔들을 상단 75%로 올려 하단 거래량 막대와 겹치지 않게 함
      rightPriceScale: { borderColor: border, scaleMargins: { top: 0.05, bottom: 0.25 } },
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

    // 거래량 막대: 별도 "volume" price scale에 배치해 캔들(하단 25% 비움)과 분리
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 }, // 하단 20%에만 거래량 표시
    });

    volumeSeries.setData(
      candles.map((c) => ({
        time: toChartTime(c.date),
        value: c.volume,
        // 봉 방향 따라 양봉 price-up / 음봉 price-down, 반투명(hex alpha 50%)
        color: `${c.close >= c.open ? priceUp : priceDown}80`,
      }))
    );

    chart.timeScale().fitContent();

    // 레전드 기본값 = 최신 봉
    const last = candles[candles.length - 1];
    const latest: Legend = {
      time: toChartTime(last.date),
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      volume: last.volume,
    };
    setLegend(latest);

    // 크로스헤어 이동 → 해당 봉 OHLC+거래량 레전드 갱신, 벗어나면 최신 봉
    const onMove = (param: MouseEventParams) => {
      const bar = param.seriesData.get(series) as CandlestickData | undefined;
      if (!param.time || !bar) {
        setLegend(latest);
        return;
      }
      const vol = param.seriesData.get(volumeSeries) as HistogramData | undefined;
      setLegend({
        time: String(param.time),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: vol?.value ?? 0,
      });
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      chart.unsubscribeCrosshairMove(onMove); // 구독 해제 먼저
      chart.remove(); // canvas 생명주기 정리 (누락 시 메모리 누수)
    };
  }, [candles, currency]);

  // 전체화면 중 ESC로 닫기
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const up = legend ? legend.close >= legend.open : true;

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 h-full w-full bg-page"
          : "relative h-full w-full"
      }
    >
      {/* 차트 캔버스 — absolute로 부모 크기에 종속시켜, 전체화면↔인라인 전환 시
          캔버스 폭이 거꾸로 부모(grid 1fr)를 밀어내는 피드백 루프를 차단.
          컨테이너 크기만 바뀌므로 autoSize가 리사이즈 처리 */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* OHLC 레전드 (크로스헤어 추적) — 차트 위 오버레이 */}
      {legend && (
        <div className="pointer-events-none absolute left-2 right-12 top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-surface/80 px-3 py-1.5 text-xs text-fg-secondary backdrop-blur">
          <span className="font-medium text-fg-primary">{legend.time}</span>
          <span>시 {formatPrice(legend.open, currency)}</span>
          <span>고 {formatPrice(legend.high, currency)}</span>
          <span>저 {formatPrice(legend.low, currency)}</span>
          <span className={up ? "text-price-up" : "text-price-down"}>
            종 {formatPrice(legend.close, currency)}
          </span>
          <span>거래량 {legend.volume.toLocaleString()}</span>
        </div>
      )}

      {/* 전체화면 토글 */}
      <button
        type="button"
        onClick={() => setFullscreen((v) => !v)}
        aria-label={fullscreen ? "전체화면 닫기" : "전체화면 보기"}
        className="pointer-events-auto absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-surface/80 text-fg-secondary backdrop-blur transition-colors hover:text-fg-primary"
      >
        <span className="text-base leading-none">{fullscreen ? "✕" : "⛶"}</span>
      </button>
    </div>
  );
}
