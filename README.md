# 주모 (Jumo)

> 국내·해외 주식 **모의투자 + 소셜** 플랫폼 — 실시간 시세로 위험 없이 투자를 연습하고, 종목을 이야기로 나눈다.

🔗 **Live Demo:** `<배포 URL 입력>`  ·  📄 **Docs:** [`/docs`](./docs)

---

## 소개

주모는 실제 돈 없이 주식 투자를 연습할 수 있는 모의투자 서비스에, 종목을 중심으로 한 소셜 피드를 결합한 플랫폼입니다. 한국투자증권(KIS) Open API로 실시간 시세를 받아 매수·매도를 체결하고, 자신의 포지션과 생각을 피드에 공유하며 다른 사용자와 소통합니다.

- **모의투자** — 원화·달러 자산을 분리 관리하며 국내/해외 종목을 거래
- **소셜** — 종목을 태그한 글, 중첩 댓글, 반응(좋아요/싫어요), 리포스트, 팔로우
- **랭킹** — 월간 시즌 기반 수익률 랭킹

## 주요 기능

| 영역 | 기능 |
|------|------|
| 시세 | KIS Open API 실시간 시세(지연 시세 명시 라벨링), 종목 상세·차트 |
| 거래 | 매수/매도 주문, 원화·달러 현금 분리 관리, 보유 종목·수익률 |
| 소셜 | 글 작성·종목 태그, 중첩 댓글, 반응, 리포스트, 팔로우 |
| 커뮤니티 | 종목별 커뮤니티 탭 |
| 랭킹 | 월간 시즌 수익률 랭킹 |
| 프로필 | 공개 프로필, 마이페이지 |

## 기술 스택

- **Frontend** — Next.js (App Router), TypeScript, Tailwind CSS
- **Backend / DB** — Supabase (PostgreSQL, Row Level Security, RPC)
- **Data** — KIS Open API (주력), Finnhub (미국 백업)
- **Infra** — Vercel

## 아키텍처 하이라이트

포트폴리오 관점에서 신경 쓴 설계 지점들입니다.

- **주문 체결 정합성 — 비관적 락**
  `execute_order` RPC에서 `SELECT ... FOR UPDATE`로 잔고·포지션 행을 잠근 뒤 체결해, 동시 주문 시 잔고 초과·중복 체결을 방지합니다.
- **KIS 토큰 보안 캐싱**
  KIS 접근 토큰을 `SECURITY DEFINER` RPC로 캐싱하고 `service_role`만 접근하도록 제한해, 토큰을 클라이언트에 노출하지 않고 재사용합니다.
- **행 수준 보안 (RLS)**
  게시글·반응·팔로우 등 사용자 데이터에 RLS 정책을 적용해 접근을 행 단위로 통제합니다.
- **시세·현금 정책**
  지연 시세는 화면에 명시적으로 라벨링하고, KRW/USD 현금을 분리 보관해 환·자산 계산을 분리합니다.
- **피드 인기순 정렬**
  `(likes - dislikes) + (comments × 2)` 점수로 정렬(시간 감쇠 없음).

## 라우트 구조

```
/                 홈 (시세 개요 · 관심종목 · 실시간 랭킹)
/feed             소셜 피드
/feed/[postId]    글 상세 · 댓글
/stocks/[id]      종목 상세 · 차트 · 주문 · 커뮤니티
/account          내 계좌 (자산 · 보유 종목 · 거래 내역)
/mypage           마이페이지 (공개 프로필)
/login            로그인
```

## 로컬 실행

```bash
# 1. 설치
npm install

# 2. 환경변수 설정 (.env.local) — 실제 키 이름은 코드에 맞춰 조정
#   NEXT_PUBLIC_SUPABASE_URL=
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=
#   KIS_APP_KEY=
#   KIS_APP_SECRET=

# 3. 개발 서버
npm run dev
```

> `.env.local` 실제 변수명은 저장소의 예시 파일(`.env.example`)을 기준으로 채우세요.

## 문서

설계·기술 문서는 [`/docs`](./docs)에 있습니다.

- [`01-PRD.md`](./docs/01-PRD.md) — 요구사항 정의서
- [`02-IA-Sitemap.md`](./docs/02-IA-Sitemap.md) — IA · 사이트맵
- [`03-ERD.md`](./docs/03-ERD.md) — 데이터 모델 / ERD
- [`04-Architecture.md`](./docs/04-Architecture.md) — 아키텍처 · 기술 결정
- [`05-Design-System.md`](./docs/05-Design-System.md) — 디자인 시스템 (토큰 · 컴포넌트)
- [`06-Screen-Definitions.md`](./docs/06-Screen-Definitions.md) — 스크린 정의
- [`07-API-Spec.md`](./docs/07-API-Spec.md) — API 명세
- [`08-Deployment-Checklist.md`](./docs/08-Deployment-Checklist.md) — 배포 체크리스트
- [`09-v2-Roadmap.md`](./docs/09-v2-Roadmap.md) — v2 로드맵
- [`retrospective/`](./docs/retrospective) — 주간 · 마일스톤 회고

## 로드맵

- [ ] 종목별 커뮤니티 탭 고도화
- [ ] 월간 시즌 랭킹 정식화
- [ ] 피드 정렬 성능 개선

---

<sub>개인 포트폴리오 프로젝트 · 실제 자금 거래가 아닌 모의투자 서비스입니다.</sub>
