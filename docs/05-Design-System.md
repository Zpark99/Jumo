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
- 등락 · 손익 · 매수/매도 모두 한국식: 상승·이익·매수 = `price-up`(빨강), 하락·손실·매도 = `price-down`(파랑) — 매수/매도도 등락 토큰 재사용으로 확정 (#52 완료)
- 하드코딩 색 → 토큰 치환 **완료** (#53 완료, `danger` 토큰 신설 포함). 전 화면 토큰 사용

## 접근성
- 다크 브랜드 위 흰 글자 대비 WCAG AA 충족으로 교정 완료 (#60 완료)

## 스페이싱
- 4px 베이스 그리드 (4 · 8 · 12 · 16 · 24 · 32 · 48) — 코드는 Tailwind 기본 스케일 사용, 커스텀 정의 없음

## 타이포
- 코드: Pretendard (예정 — 현재 코드는 Geist, 미반영) / Figma: Noto Sans KR
- 가격·수치: tabular figures

## 컴포넌트 (Figma)
- Nav / 상단 내비 (상태=로그아웃·로그인)
- Sidebar / 내 투자
- (주문 패널 · 지수 카드 · 뉴스 아이템 · 포스트 카드 — 예정)

## P5 적용 현황 (2026-10-09)

| 화면 | 상태 | 코드 |
|---|---|---|
| 전역 내비 | ✅ 전역 `TopNav` + 모바일 햄버거. 페이지별 중복 헤더 제거, `/login`은 숨김 (#104) | `components/TopNav.tsx` |
| 종목 상세 | ✅ 레이아웃 재설계 + 컴포넌트 분리, 호가·뉴스·차트·커뮤니티 탭 (#83·#85·#88·#90·#94·#113·#114·#112) | `app/stocks/[id]/` — `StockHeader` `StockTabs` `OrderPanel` `ConfirmModal` `OrderBook` `StockNews` `CandleChart` |
| 홈 | ✅ 3컬럼 레이아웃 셸 + 위젯 (#96·#98·#102) | `components/home/` — `MyInvestmentCard` `RankingPreview` `StockList` `IndexCardGrid` `SchedulePanel` |
| 피드 | ✅ 작성폼·정렬 세그먼트·포스트 카드화 리스타일 (#116). 소셜 로직 무변경, 종목상세 커뮤니티 탭과 공유 | `components/PostFeed.tsx` |
| 랭킹 · 계좌 · 마이페이지 · 프로필 | ⏳ P4 토큰화만 적용, P5 리스타일 미착수 | — |

- **다크 기본 고정 유지**: `<html class="dark">`. 토글은 여전히 미결정 (#51)
- **목업으로 남은 위젯**: 지수 카드(#108), 일정/뉴스 패널(#109·#110) — UI는 완성, 데이터만 목업
