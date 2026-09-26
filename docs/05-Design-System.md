# 05. 디자인 시스템

## 컬러 토큰
- 컬렉션: `Color/Light`, `Color/Dark` (무료 플랜 모드 제한으로 분리) — 각 13개 시맨틱 토큰
- 등락: **한국식** (상승 빨강 `#F04452`/`#FF5C68`, 하락 파랑 `#3182F6`/`#4C97FF`)
- 브랜드: **보라** (`#6C5CE7`/`#8B7DF2`) — 등락 색과 분리
- 코드 매핑: `app/globals.css` — `:root` 라이트 / `.dark` 다크, `var(--color-*)` (Figma 코드 변수명 1:1)
- Tailwind 유틸: `bg-page` `bg-surface` `bg-card` · `border-border` · `text-fg-primary|secondary|muted` · `bg-brand` `bg-brand-pressed` `bg-brand-tint` · `text-price-up|down|flat`
  - 텍스트 색은 `text-*` 유틸 충돌을 피하려고 `fg-*`
- 다크 모드: 클래스 기반, 현재 **기본 다크 고정** (토글 #51)

## 색 규율
- 브랜드 = 보라. UI 강조에 파랑 금지 (파랑은 하락 전용)
- 등락 · 손익 모두 한국식: 상승·이익 = `price-up`(빨강), 하락·손실 = `price-down`(파랑)
- 결정 대기 (#52, #53)
  - 수익률 정확히 0일 때 `price-flat` 적용 여부
  - 매수/매도 구분 색 전용 토큰 여부 (현재 등락 토큰 재사용 보류)
  - 에러 텍스트 · 체결/성공 배지용 시맨틱 토큰 필요 여부
- 하드코딩 색 → 토큰 치환 진행 중 (#53) — 남은 화면: `profile/[userId]`, `/stocks` 목록, `/feed` 목록

## 접근성
- 다크 브랜드 `#8B7DF2` 위 흰 글자 대비 약 3.3:1 → 작은 글씨 AA(4.5:1) 미달. on-brand 텍스트 토큰 또는 명도 조정 필요 (#60)

## 스페이싱
- 4px 베이스 그리드 (4 · 8 · 12 · 16 · 24 · 32 · 48) — 코드는 Tailwind 기본 스케일 사용, 커스텀 정의 없음

## 타이포
- 코드: Pretendard (예정 — 현재 코드는 Geist, 미반영) / Figma: Noto Sans KR
- 가격·수치: tabular figures

## 컴포넌트 (Figma)
- Nav / 상단 내비 (상태=로그아웃·로그인)
- Sidebar / 내 투자
- (주문 패널 · 지수 카드 · 뉴스 아이템 · 포스트 카드 — 예정)
