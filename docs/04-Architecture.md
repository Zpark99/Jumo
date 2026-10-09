# 04. 아키텍처 · 기술 결정

## 시스템 구성
- Frontend: Next.js (App Router) + TypeScript + Tailwind CSS
- Backend/DB: Supabase (PostgreSQL, RLS, RPC)
- Data: KIS Open API (주력), Finnhub (미국 백업)
- Infra: Vercel

## 데이터 흐름
- 시세: KIS → (캐싱/프록시) → 클라이언트
- 주문: 클라이언트 → RPC → DB

## KIS 연동 제약 (2026-10-08 실측)
- **실전 도메인 필수**: `KIS_BASE_URL`은 실전(`openapi.koreainvestment.com:9443`). 시세·캔들·호가는 시장데이터라 모의투자(VTS) 도메인에서는 `EGW00103`으로 거부된다. VTS는 주문/계좌용 (#39)
- **지원 시장은 국내(`KR`)만**: 해외 API 일체(해외주식 현재가·해외지수·환율)가 `EGW02004 실전투자 도메인은 모의투자 앱키로 호출하실 수 없습니다`로 차단 — 특정 TR 문제가 아니라 **해외 권한 자체가 없음**. `lib/constants.ts`의 `SUPPORTED_MARKETS = ["KR"]`로 목록·검색·호가에서 해외 종목을 숨긴다. KIS 해외주식 API 신청 후 `"US"` 복원 (#120)
- **rate limit 초당 2건**: 300ms 간격 3번째 호출에서 `EGW00201`. 다건 조회는 순차 호출 + 캐시가 전제. 현재가는 50초 DB 캐시(`QUOTE_CACHE_TTL_MS`), 호가는 탭이 열린 동안만 3초 폴링(0.33/s)

## 기술 결정
- **주문 체결 정합성 — 비관적 락**: `execute_order` RPC에서 `SELECT ... FOR UPDATE`로 잔고·포지션 잠금 후 체결 (동시 주문 시 초과·중복 체결 방지)
- **KIS 토큰 보안 캐싱**: `SECURITY DEFINER` RPC로 토큰 캐싱, `service_role`만 접근 (클라이언트 비노출)
- **0원 체결 차단 — 데이터 계층 CHECK**: `price_quotes.price > 0` CHECK 제약으로 0 이하 시세 행의 존재 자체를 불가능하게 만듦. `execute_order`(머니 함수) 본문을 재정의하는 대신 **모든 writer가 수렴하는 지점**에서 막는 선택. 계기: `/api/quote`가 market 구분 없이 국내 엔드포인트를 호출해 해외 코드에 `rt_cd=0`(성공) + 현재가 `0`이 돌아오고, 그 0이 캐시되면 `execute_order`가 가격 범위 검증 없이 0원에 체결하던 경로 (#120, #121)
- **행 수준 보안(RLS)**: 사용자 데이터 접근 행 단위 통제
- **시세·현금 정책**: 지연 시세 명시 라벨링, KRW/USD 현금 분리 보관
- **피드 인기순 정렬**: `(likes - dislikes) + (comments × 2)` (시간 감쇠 없음), 동점은 최신순 — **확정** (#32, 2026-10-09). 클라이언트 정렬이라 최신 1000건 범위 안에서만 정확하고, 글 1000건 도달 시 DB 스코어 컬럼 + 서버 사이드 정렬로 전환하며 식도 함께 재검토 (#37)
- **반응 전환은 delete+insert**: `post_reactions`에 UPDATE RLS 정책을 두지 않고(등록/삭제만) 좋아요↔싫어요 전환을 delete 후 insert로 처리 — **확정** (#38, 2026-10-09). 카운트가 `feed_posts` 뷰의 서브쿼리 실시간 집계라 드리프트가 없고, `upsert`로 바꾸면 UPDATE 정책이 필요해져 `with check` 누락 시 타 사용자 행 수정 위험이 생긴다 (이득은 전환당 왕복 1회 절약뿐)
- **시즌 기준 자산 스냅샷**: `pg_cron`이 매일 00:00 KST `capture_asset_snapshots()` 실행 + 계좌 생성 트리거. KST 날짜로 기록해 UTC 기준 시즌 경계와 무관하게 동작하고, `on conflict do nothing`이라 기준점이 바뀌지 않음(그날 누락되면 다음날 스냅샷이 대체). 기준 자산과 현재 자산은 `account_total_assets_krw()` 한 함수로 계산 (#47, #67)
- **다크 모드**: `.dark` 클래스 기반(`@custom-variant dark`). 현재 `<html class="dark">` 고정으로 기본 다크, 서버 렌더에 포함돼 첫 페인트 깜빡임 없음. 토글은 미구현 (#51)
