# 주모 (Jumo)

> 국내·해외 주식 **모의투자 + 소셜** 플랫폼 — 실시간 시세로 위험 없이 투자를 연습하고, 종목을 이야기로 나눈다.

🔗 **Live Demo:** https://jumo-one.vercel.app  ·  📄 **Docs:** [`/docs`](./docs)

---

## 소개

주모는 실제 돈 없이 주식 투자를 연습할 수 있는 모의투자 서비스에, 종목을 중심으로 한 소셜 피드를 결합한 플랫폼입니다. 한국투자증권(KIS) Open API로 실시간 시세를 받아 매수·매도를 체결하고, 자신의 포지션과 생각을 피드에 공유하며 다른 사용자와 소통합니다.

- **모의투자** — 원화·달러 자산을 분리 관리하며 종목을 거래 (현재 거래 가능 시장은 **국내**. 해외는 KIS 해외 API 권한 확보 후 복원 예정)
- **소셜** — 종목을 태그한 글, 중첩 댓글, 반응(좋아요/싫어요), 리포스트, 팔로우
- **랭킹** — 가입 시드 대비 누적 수익률 랭킹

## 주요 기능

| 영역 | 기능 |
|------|------|
| 시세 | KIS Open API 시세(지연 시세 명시 라벨링), **10단 호가**(실데이터·3초 폴링) |
| 차트 | 캔들 차트 + 거래량 막대, **일/주/월 기간 전환**, 크로스헤어 OHLC 레전드, 전체화면 |
| 거래 | 매수/매도 주문, 원화·달러 현금 분리 관리, 보유 종목·수익률 |
| 소셜 | 글 작성·종목 태그, 중첩 댓글, 반응, 리포스트, 팔로우 |
| 커뮤니티 | 종목별 커뮤니티 탭 |
| 랭킹 | 누적 수익률 랭킹 (가입 시드 대비) |
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
- **0원 체결 차단 — 데이터 계층 제약**
  시세 조회가 성공 응답(`rt_cd=0`)과 함께 현재가 `0`을 돌려주는 경로가 있었고, 그 0이 캐시되면 0원에 체결될 수 있었습니다. 체결 함수를 고치는 대신 `price_quotes.price > 0` CHECK 제약으로 **모든 writer가 수렴하는 지점**에서 막아, 0 이하 시세 행 자체가 존재할 수 없게 했습니다.

## 라우트 구조

```
/                  홈 (3컬럼 — 내 투자 요약 · 종목 목록 · 지수/일정/랭킹 프리뷰)
/stocks            종목 목록
/stocks/[id]       종목 상세 · 차트 · 호가 · 뉴스 · 주문 · 커뮤니티
/feed              소셜 피드 (로그인 필요)
/feed/[postId]     글 상세 · 댓글
/ranking           누적 수익률 랭킹
/account           내 계좌 (자산 · 보유 종목 · 거래 내역)
/mypage            마이페이지 (프로필 편집)
/profile/[userId]  공개 프로필 · 팔로우
/login             로그인
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

- [ ] 지수 카드 실데이터 (국내지수) · 차트 분봉 · KIS 웹소켓 실시간 시세
- [ ] 뉴스 데이터 소스 연동
- [ ] 해외 종목 복원 (KIS 해외 API 권한 확보 선행)
- [ ] 시즌 랭킹 (기간별 기준점 리셋, v2 #47 — v1.0은 누적 수익률로 확정 #67)
- [ ] 종목별 커뮤니티 탭 고도화 · 피드 정렬 성능 개선

자세한 내용은 [`09-v2-Roadmap.md`](./docs/09-v2-Roadmap.md) 참고.

---

<sub>개인 포트폴리오 프로젝트 · 실제 자금 거래가 아닌 모의투자 서비스입니다.</sub>
