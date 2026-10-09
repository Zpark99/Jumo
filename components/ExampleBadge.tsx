// 목업 데이터임을 화면에 밝히는 배지. 실데이터로 바꾸면 호출부에서 isExample을 뺀다.
export default function ExampleBadge() {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-fg-muted">
      예시
    </span>
  );
}
