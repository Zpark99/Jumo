export type ScheduleItem = {
  id: string;
  date: string; // 표시용 문구 (목업). 실제 연동 시 date로 교체 가능
  title: string;
  tag: string; // 지표 / 실적 / 통화정책 등
};

// 목업 주요 일정 — 도메인상 말 되는 매크로/실적 일정을 결정적으로 생성.
// UI ↔ 데이터 분리: 나중에 실제 일정/뉴스 소스 응답을 SchedulePanel에 그대로 넘기면 됨.
export function buildMockSchedule(): ScheduleItem[] {
  return [
    { id: "s0", date: "10/10", title: "미국 9월 소비자물가(CPI) 발표", tag: "지표" },
    { id: "s1", date: "10/14", title: "삼성전자 3분기 잠정 실적", tag: "실적" },
    { id: "s2", date: "10/16", title: "한국은행 금융통화위원회", tag: "통화정책" },
    { id: "s3", date: "10/24", title: "테슬라 3분기 실적 발표", tag: "실적" },
    { id: "s4", date: "10/29", title: "미국 FOMC 기준금리 결정", tag: "통화정책" },
    { id: "s5", date: "10/31", title: "국내 10월 수출입 동향", tag: "지표" },
  ];
}

type Props = {
  items: ScheduleItem[];
};

// 주요 일정 패널. 순수 표시 컴포넌트 — 데이터는 props로 받음(목업/실시간 무관).
export default function SchedulePanel({ items }: Props) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="text-sm font-medium text-fg-secondary">주요 일정 / 뉴스</h2>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-fg-secondary">예정된 일정이 없습니다</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <span className="mt-0.5 w-10 shrink-0 text-xs font-semibold text-fg-primary">
                {item.date}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg-primary">{item.title}</p>
                <span className="mt-1 inline-block rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-fg-secondary">
                  {item.tag}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
