import ExampleBadge from "@/components/ExampleBadge";

export type NewsItem = {
  id: string;
  headline: string;
  source: string;
  time: string; // 표시용 상대시간 문구 (목업). 실제 연동 시 publishedAt로 교체 가능
  url: string | null; // 원문 링크. 없으면(목업) 링크 없이 표시
};

// 목업 뉴스 생성 — 종목명 기준 그럴듯하게 결정적으로 생성(렌더마다 안 흔들림).
// 지어낸 헤드라인이므로 출처도 실제 언론사가 아닌 가상 이름을 쓰고 링크는 두지 않는다.
// UI ↔ 데이터 분리: 나중에 실제 뉴스 소스 응답을 StockNews에 그대로 넘기면 됨.
export function buildMockNews(stockName: string): NewsItem[] {
  const rows: { headline: string; source: string; time: string }[] = [
    { headline: `${stockName}, 3분기 실적 시장 기대치 상회`, source: "주모경제", time: "1시간 전" },
    { headline: `외국인·기관 ${stockName} 동반 순매수…주가 반등 시도`, source: "모의일보", time: "3시간 전" },
    { headline: `[특징주] ${stockName}, 신사업 기대감에 장중 강세`, source: "가상뉴스", time: "5시간 전" },
    { headline: `증권가 "${stockName} 중장기 긍정적"…목표주가 상향`, source: "샘플투데이", time: "어제" },
    { headline: `${stockName} 배당 확대 검토 소식에 투자자 관심 집중`, source: "예시데일리", time: "어제" },
    { headline: `${stockName} 관련 업종 전반 변동성 확대`, source: "주모경제", time: "2일 전" },
  ];
  return rows.map((r, i) => ({ id: `news-${i}`, url: null, ...r }));
}

type Props = {
  items: NewsItem[];
  isExample?: boolean; // 목업을 넘길 때 true → "예시" 배지 + 안내
};

// 뉴스 리스트. 순수 표시 컴포넌트 — 데이터는 props로 받음(목업/실시간 무관).
export default function StockNews({ items, isExample = false }: Props) {
  if (items.length === 0) {
    return <p className="mt-8 text-sm text-fg-secondary">관련 뉴스가 없습니다</p>;
  }

  return (
    <div className="mt-8">
      {isExample && (
        <p className="mb-2 flex items-center gap-2 px-2 text-xs text-fg-muted">
          <ExampleBadge />
          실제 기사가 아닌 화면 예시입니다
        </p>
      )}
      <ul className="divide-y divide-border">
        {items.map((item) => {
          const body = (
            <>
              <p className="line-clamp-2 text-sm font-medium text-fg-primary">
                {item.headline}
              </p>
              <p className="mt-1 text-xs text-fg-muted">
                {item.source} · {item.time}
              </p>
            </>
          );

          return (
            <li key={item.id}>
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg px-2 py-3 transition-colors hover:bg-surface"
                >
                  {body}
                </a>
              ) : (
                <div className="px-2 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
