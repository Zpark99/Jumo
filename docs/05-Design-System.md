# 05. 디자인 시스템

## 컬러 토큰
- 컬렉션: `Color/Light`, `Color/Dark` (무료 플랜 모드 제한으로 분리) — 각 13개 시맨틱 토큰
- 등락: **한국식** (상승 빨강 `#F04452`/`#FF5C68`, 하락 파랑 `#3182F6`/`#4C97FF`)
- 브랜드: **보라** (`#6C5CE7`/`#8B7DF2`) — 등락 색과 분리
- 코드 매핑: `app/globals.css` — `:root` 라이트 / `.dark` 다크, `var(--color-*)` (Figma 코드 변수명 1:1)
- Tailwind 유틸: `bg-page` `bg-surface` `bg-card` · `border-border` · `text-fg-primary|secondary|muted` · `bg-brand` `bg-brand-pressed` `bg-brand-tint` · `text-price-up|down|flat` · `text-danger` `bg-danger` `bg-danger-pressed` · `text-success` `bg-success-tint`
  - 텍스트 색은 `text-*` 유틸 충돌을 피하려고 `fg-*`

### 상태 시맨틱 토큰 (#130, 2026-10-13)

| 토큰 | 라이트 / 다크 | 용도 |
|---|---|---|
| `danger` (`-pressed`) | `#E5484D` / `#FF6166` | **에러 문구 + 위험 액션(삭제)** 통합 — 둘 다 "문제·주의" 의미. 글자수 초과 카운터도 포함 |
| `success` (`-tint`) | `#14733A` on `#E3F6EA` / `#4ADE80` on `#1B3A2B` | 성공 토스트(저장·체결 완료), 장중 배지 같은 긍정 상태 |

- 등락 `price-up|down`과 **분리**: 빨강이 "상승"과 "에러"를 동시에 뜻하면 손익 화면에서 오독되므로 상태 색은 별도 토큰만 쓴다. 매수/매도·손익은 계속 `price-*`
- 대비(WCAG AA 4.5:1): 다크 `danger` 6.05(page)·5.15(card), `success` 8.68(card)·7.14(tint). 라이트 `success` 5.93·5.26(tint). **라이트 `danger`는 3.91로 미달** — v1.0은 다크 고정이라 영향 없음, 라이트 토글(#51) 재개 시 명도 교정 필요
- 다크 모드: 클래스 기반, 현재 **기본 다크 고정** (토글 #51)

## 색 규율
- 브랜드 = 보라. UI 강조에 파랑 금지 (파랑은 하락 전용)
- 등락 · 손익 · 매수/매도 모두 한국식: 상승·이익·매수 = `price-up`(빨강), 하락·손실·매도 = `price-down`(파랑) — 매수/매도도 등락 토큰 재사용으로 확정 (#52 완료)
- 하드코딩 색 → 토큰 치환: #53은 레이아웃 색만 끝냈고 에러 문구(`text-red-500` 29건)·성공 배지(`green-*` 12건)·`zinc-*` 2건이 남아 있었다(2026-10-09 실측, 당시 문서의 "완료"는 과장). **#130(2026-10-13)에서 `success` 신설 + 잔존 전부 치환해 실제 완료.** 이후 `red-*`/`green-*`/`zinc-*` 직접 사용 금지

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
