# 07. API 명세 (v1.0 최종, 2026-10-25)

> 코드(`app/api/**`, `lib/`, `supabase/migrations/`)와 운영 DB(`pg_proc`·`pg_class`·`cron.job` 조회, 2026-10-25)를 대조해 작성. 문서에만 있던 항목은 지웠고, 코드에만 있던 항목은 넣었다. 운영 DB에서 마이그레이션 의도와 다르게 확인된 것은 ⚠️로 표시.

## 1. Route Handlers (`app/api/**`)

인증 미들웨어(`middleware.ts`/`proxy.ts`)는 없다. 아래 5개 중 **로그인이 필요한 라우트는 없고**, cron 라우트만 `CRON_SECRET`을 요구한다. 모든 KIS 호출은 서버에서만 일어나며(`lib/kis.ts`의 토큰은 `service_role`로만 조회), 응답 캐시는 라우트별로 다르다.

| 라우트 | 메서드 | 인증 | 캐시 (위치 · TTL) | KIS 호출 / rate limit 대응 |
|---|---|---|---|---|
| `/api/quote/[stockId]` | GET | 없음 (`Authorization` 헤더는 선택, 있으면 그대로 Supabase에 전달) | **DB `price_quotes`** · 50초 (`QUOTE_CACHE_TTL_MS`) | 캐시 미스 시 1건 (`FHKST01010100`) |
| `/api/candles/[stockId]` | GET | 없음 | 없음 (매 요청 KIS) | 1건 (`FHKST03010100`) |
| `/api/orderbook/[stockId]` | GET | 없음 | 없음. 클라이언트가 호가 탭이 열린 동안만 3초 폴링 (0.33건/s) | 1건 (`FHKST01010200`) |
| `/api/indices` | GET | 없음 | **Next 데이터 캐시** `unstable_cache` · 60초 (`INDEX_CACHE_TTL_SEC`). Vercel 인스턴스 간 공유 실측(#108). 실패 결과도 TTL 동안 캐시 | TTL당 2건 (`FHPUP02100000` 코스피·코스닥), 600ms 간격 순차 |
| `/api/cron/refresh-quotes` | GET | **`Authorization: Bearer <CRON_SECRET>`** 필수. env 미설정 시 항상 401 (fail-closed) | 없음 (결과는 `price_quotes`에 저장) | `SUPPORTED_MARKETS` 종목 수만큼(현재 KR 4건) 600ms 간격 순차 |

### 1.1 `GET /api/quote/[stockId]`
- **파라미터**: `stockId` — `KR-005930` 형식. KIS 호출 시에만 `KR-`/`US-` 접두사 제거, DB 조회는 원형.
- **동작**: `price_quotes` 행이 있고 `fetched_at`이 50초 이내면 그대로 반환. 아니면 KIS 현재가 조회 → `upsert_price_quote` RPC(service_role)로 저장 → 반환. 저장 실패는 로그만 남기고 시세는 반환.
- **응답 200**: `{ stock_id, price, prev_close, change_rate, fetched_at }`
- **에러**: `500 { error: <DB 메시지> }` (price_quotes 조회 실패) · `404 { error: "QUOTE_NOT_FOUND" }` (KIS `rt_cd≠0`, 현재가 0 이하·비숫자, 토큰 실패 등 예외 전부)
- **0원 차단**: `price <= 0`은 저장·반환하지 않는다(`lib/quotes.ts`). DB에도 `price_quotes_price_positive` CHECK(`price > 0`)가 있어 어떤 writer도 0 이하를 넣을 수 없다(#120·#121).
- **호출 위치**: `app/stocks/[id]/page.tsx` — 상세 진입 후 5초 폴링, 주문 직전 1회 재호출(V3_STALE_QUOTE 방지, #1).

### 1.2 `GET /api/candles/[stockId]?period=D|W|M`
- **파라미터**: `period` 미지정·비정상 값은 `D`. 조회 구간은 100봉을 채우도록 기간별로 다름 — D 200일 / W 800일 / M 3650일. 응답은 날짜 오름차순 **최대 100봉**.
- **응답 200**: `{ stock_id, candles: [{ date: "YYYYMMDD", open, high, low, close, volume }] }`
- **에러**: `404 { error: "CANDLES_NOT_FOUND" }` — `rt_cd≠0`, 유효 봉 0건, 토큰 실패 등 전부.
- **KIS**: 일/주/월봉 모두 같은 TR `FHKST03010100`, `FID_PERIOD_DIV_CODE`만 바뀐다. 분봉(`FHKST03010200`, 1회 30건)은 미구현(#112, v2).
- **호출 위치**: `app/stocks/[id]/page.tsx` — 차트 탭 진입·기간 전환 시.

### 1.3 `GET /api/orderbook/[stockId]`
- **게이트**: `stockId` 접두사가 `SUPPORTED_MARKETS`(`["KR"]`)에 없으면 `404 { error: "ORDERBOOK_NOT_SUPPORTED" }` — KIS 해외 권한이 없어서(#120).
- **응답 200**: `{ stock_id, asks: [{ price, quantity }], bids: [...] }` — 매도는 `askp10 → askp1`(높은 가격 먼저), 매수는 `bidp1 → bidp10`(현재가에 가까운 것 먼저). `OrderBook.tsx`의 표시 계약.
- **빈 값 처리**: `rt_cd=0`인데 값이 비는 응답(#120 유형)은 0 이하·비숫자 호가를 버리고, 양쪽 다 비면 `404 { error: "ORDERBOOK_NOT_FOUND" }`.
- **호출 위치**: `app/stocks/[id]/page.tsx` — 호가 탭이 열린 동안 3초 폴링, 탭을 벗어나면 중단.

### 1.4 `GET /api/indices`
- **응답 200**: `{ indices: [{ id: "kospi"|"kosdaq", name, value, change, changePct }], fetched_at }` — `value: null`은 조회 실패(화면 "-"). 목업으로 대체하지 않는다.
- **에러**: `503 { error: "INDEX_UNAVAILABLE" }` — 토큰 발급 실패 등 캐시 함수 자체가 throw한 경우. 이 경우는 캐시되지 않아 다음 요청이 재시도.
- **빈 값 처리**: `rt_cd=0`이어도 `output`이 비는 경우가 실측됐다(코스닥, 2026-10-13). 0 이하·비숫자는 해당 지수만 `null`.
- **캐시 선택 이유**: 홈은 비로그인도 열 수 있어 호출 수가 사용자 수에 비례. 메모리 캐시는 서버리스 인스턴스마다 따로라 상한을 보장 못 하고, DB 캐시(`price_quotes`)는 `stocks` FK 때문에 지수를 넣을 수 없어 Next 데이터 캐시를 썼다.
- **호출 위치**: `app/page.tsx` → `IndexCardGrid` — 홈에서 60초 폴링(TTL과 동일). 해외지수·환율·BTC 카드는 KIS 범위 밖이라 "예시" 목업(#138).

### 1.5 `GET /api/cron/refresh-quotes`
- **호출자**: Vercel Cron (`vercel.json`: `0 7 * * 1-5` UTC = 평일 16시대 KST). Vercel이 `Authorization: Bearer <CRON_SECRET>`을 자동으로 붙인다.
- **동작**: `stocks`에서 `SUPPORTED_MARKETS` 종목을 service_role로 조회 → 종목마다 `fetchAndStoreQuote` (`/api/quote`와 **같은 쓰기 경로** `lib/quotes.ts`) 순차 호출. 한 종목이 실패해도 나머지는 계속.
- **응답 200**: `{ updated: [stockId...], failed: [{ stockId, reason }] }` — `reason`은 `QUOTE_NOT_FOUND` / upsert 에러 메시지 / 예외 메시지.
- **에러**: `401 Unauthorized` (secret 불일치·미설정) · `500 { error }` (stocks 조회 실패).
- **왜 16시대인가**: Vercel Hobby cron은 시 단위 정밀도(±59분). 15시대로 잡으면 장 마감(15:30) 전에 돌 수 있어 한 시간 미뤘다. 놓친 실행은 홈·`/stocks` 목록의 "MM/DD 기준" 표기로 드러난다(#165).
- **운영 이력**: 10/14~10/19 `CRON_SECRET` 미등록으로 평일 4회 전부 401 → 10/19 등록·Redeploy 후 200 (#166). env는 새 배포에만 적용된다.

## 2. KIS Open API 연동

- **인증/토큰**: `POST /oauth2/tokenP` → `kis_tokens`(id=1 단일 행)에 저장. `get_kis_token()`이 만료 5분 전까지만 유효로 반환하고, 없으면 `lib/kis.ts`가 재발급 후 `upsert_kis_token`. 토큰 값은 로그에 남기지 않는다(#17).
- **BASE_URL**: **실전** `openapi.koreainvestment.com:9443` (`KIS_BASE_URL`, 미설정 시 이 값). 시세·캔들·호가는 시장데이터라 모의투자(VTS) 도메인에서는 `EGW00103`으로 거부된다(#39). VTS는 주문/계좌용.
- **공통 헤더**: `authorization: Bearer <token>`, `appkey`, `appsecret`, `tr_id`. 호가·지수는 `custtype: P` 추가.
- **rate limit**: **초당 2건** — 300ms 간격 3번째 호출에서 `EGW00201` 실측(2026-10-08). 다건 조회는 600ms 간격 순차 + 캐시가 전제.
- **지연 시세**: 화면에 "지연 시세" 배지. 현재가 50초 캐시는 `execute_order`의 신선도 한도(`v_quote_max_age` 60초)보다 짧아야 한다 — 두 값은 항상 함께 조정.
- **웹소켓**: `POST /oauth2/Approval`로 `approval_key` 발급 → `ws://ops.koreainvestment.com:21000`. 구독 성공까지만 확인, 미구현(#119). `approval_key`는 브라우저에 내리면 안 되므로 서버 릴레이가 필요하다.

### 2.1 가용성 최종 (국내 O / 해외 X)

| 용도 | 엔드포인트 / TR | v1.0 상태 |
|---|---|---|
| 국내 현재가 | `domestic-stock/v1/quotations/inquire-price` / `FHKST01010100` | ✅ `/api/quote`, cron |
| 국내 호가 10단 | `domestic-stock/v1/quotations/inquire-asking-price-exp-ccn` / `FHKST01010200` | ✅ `/api/orderbook` (#87) |
| 국내 일·주·월봉 | `domestic-stock/v1/quotations/inquire-daily-itemchartprice` / `FHKST03010100` (`FID_PERIOD_DIV_CODE`=`D`/`W`/`M`) | ✅ `/api/candles` (#112) |
| 국내지수 | `domestic-stock/v1/quotations/inquire-index-price` / `FHPUP02100000` (`FID_COND_MRKT_DIV_CODE`=`U`, `0001` 코스피 / `1001` 코스닥) | ✅ `/api/indices` (#108) |
| 국내 분봉 | `domestic-stock/v1/quotations/inquire-time-itemchartprice` / `FHKST03010200` | ⏳ 가용 확인, 미구현. 1회 30건 제한 → 반복 호출+병합 필요 (#112, v2) |
| 실시간 체결가·호가 | WebSocket `H0STCNT0`·`H0STASP0` | ⏳ 구독 성공 확인, 미구현 (#119, v2) |
| **해외 전부** (주식·지수·환율) | `overseas-price/v1/quotations/price` / `HHDFS00000300` 등 | ❌ `EGW02004` — 해외 권한 자체 없음. KIS 해외주식 API 신청 선행 (#120, v2) |
| 비트코인 | — | ❌ KIS 범위 밖. 별도 소스 필요 |

`stocks` 테이블에는 US 4종목(AAPL·TSLA·NVDA·MSFT)이 남아 있지만 `SUPPORTED_MARKETS=["KR"]`로 목록·검색·호가에서 숨긴다.

## 3. DB 함수 (RPC·트리거)

실행 권한은 **운영 DB `pg_proc.proacl` 실측(2026-10-25)** 기준. Supabase는 새 함수마다 anon·authenticated에 EXECUTE를 직접 부여하므로 `revoke … from public`만으로는 지워지지 않는다(#137). 아래 ⚠️는 마이그레이션 의도(authenticated만)와 달리 anon에 EXECUTE가 남은 것.

| 함수 | DEFINER | 실행 권한 (실측) | 호출 위치 | 비고 |
|---|---|---|---|---|
| `execute_order(p_stock_id, p_side, p_quantity, p_order_type, p_limit_price?)` | ✅ | authenticated, service_role, ⚠️ anon | `app/stocks/[id]/page.tsx` (`p_order_type: "market"`) | 내부 `auth.uid()` null → `AUTH_REQUIRED` 예외라 anon은 실질 거부. 아래 3.1 |
| `get_kis_token()` | ✅ | service_role만 | `lib/kis.ts` | 만료 5분 전까지만 반환 |
| `upsert_kis_token(p_token, p_expires_at)` | ✅ | service_role만 | `lib/kis.ts` | |
| `upsert_price_quote(p_stock_id, p_price, p_prev_close, p_change_rate)` | ✅ | service_role만 | `lib/quotes.ts` (quote 라우트 + cron) | `price > 0` CHECK 위반 시 `23514` |
| `get_or_create_current_season()` | ✅ | authenticated, service_role, ⚠️ anon | `app/ranking/page.tsx`, pg_cron | 이번 달 시즌 행 조회/생성, 활성 시즌 1개 유지. anon 호출은 행 생성만 가능(데이터 노출 없음) — 회수 후보 |
| `calculate_season_ranking(p_season_id)` | ✅ | authenticated, service_role | `/ranking` "지금 갱신" 버튼, pg_cron | 전 계좌 풀스캔 upsert. anon은 #137에서 회수됨 ✅ |
| `account_total_assets_krw()` | ❌ | postgres, service_role | `capture_asset_snapshots` 내부 | KRW 현금 + KRW 보유(시세 없으면 평단가). USD 미집계 |
| `capture_asset_snapshots()` | ❌ | postgres, service_role | pg_cron | 오늘(KST) 행 없는 계좌만 insert, 새로 기록한 행 수 반환 |
| `snapshot_new_account()` | ✅ (trigger) | postgres, service_role | `accounts` AFTER INSERT | 가입 시점 기준 스냅샷 (#47) |
| `handle_new_user()` | ✅ (trigger) | 기본 grant | `auth.users` AFTER INSERT | `profiles` + `accounts`(cash_krw 10,000,000 / cash_usd 10,000) 생성 |
| `is_my_account(acc)` | ✅ | 기본 grant | RLS 정책 내부 (`holdings`·`transactions`·`asset_snapshots`·`watchlist_items`) | RLS 헬퍼. 외부 호출 의미 없음 |
| `set_updated_at()` | ❌ (trigger) | 기본 grant | `accounts`·`holdings`·`posts`·`comments` BEFORE UPDATE | |
| `force_server_timestamps()` | ❌ (trigger) | 기본 grant | `posts`·`comments` BEFORE INSERT | 클라이언트가 보낸 `created_at` 무시 (#137) |

모든 SECURITY DEFINER 함수는 `search_path = public` 고정이며, #137 마이그레이션이 미고정 함수가 있으면 적용을 실패시키는 가드를 포함한다.

### 3.1 `execute_order` 계약
- **입력**: `p_side` `buy|sell`, `p_order_type` `market|limit`, `p_quantity > 0`, `p_limit_price`는 limit일 때만.
- **반환** (1행): `{ order_id, status: 'filled'|'rejected'|'pending', executed_price, executed_quantity, reject_reason }`
- **예외(raise)**: `AUTH_REQUIRED` · `INVALID_SIDE` · `INVALID_ORDER_TYPE` · `ACCOUNT_NOT_FOUND`
- **거부 코드(`reject_reason`)**: `V1_INVALID_QUANTITY` · `V2_STOCK_NOT_FOUND` · `V3_NO_QUOTE` · `V3_STALE_QUOTE`(60초 초과) · `V4_INVALID_LIMIT_PRICE` · `V5_INSUFFICIENT_CASH` · `V6_INSUFFICIENT_HOLDINGS`. V1·V2·V4는 `orders` insert 전에 거부(행 없음), V3·V5·V6는 insert 후 `rejected`로 남겨 감사 추적.
- **락**: `accounts` 행을 `SELECT … FOR UPDATE`로 잠근 뒤 검증·체결(V7). 매도 시 `holdings` 행도 잠금. 전량 매도면 `holdings` 행 삭제.
- **체결가**: 항상 `price_quotes.price`(서버 기준가). 클라이언트 가격은 받지 않는다. 수수료 0.
- **limit**: `pending`으로 등록만 하고 체결하지 않는다. **UI는 `market`만 보낸다.**
- **쓰기 경로 유일성**: `orders`·`accounts`의 클라이언트 INSERT/UPDATE 정책·권한은 회수돼(#137·#142) 이 함수가 유일한 쓰기 경로.
- **테스트**: 엣지케이스 7건(`supabase/tests/20260623_execute_order_edge_cases.sql`, 순차) + 동시성 8체크(`concurrency_execute_order.mjs`, 매수·매도 레이스 각 4). 실행법은 CLAUDE.md.

## 4. 뷰

운영 DB `pg_class.reloptions` + `role_table_grants` 실측(2026-10-25).

| 뷰 | invoker/definer | 노출 컬럼 | 권한 (실측) | 사용처 |
|---|---|---|---|---|
| `season_rankings` | **definer** (`security_invoker=false`, #180) | `season_id, account_id, user_id, user_nickname, user_icon, total_asset, return_rate, rank, updated_at` — 잔고·시드 컬럼 없음 | **authenticated SELECT만**. anon·public 없음 | `/ranking`, 홈 `RankingPreview`·`MyInvestmentCard` |
| `posts_with_author` | definer (옵션 미지정 = 기본값) | posts 컬럼 + 작성자 닉네임·아이콘 + like/dislike/comment 실시간 집계 | ⚠️ 기본 grant 그대로 — **anon·authenticated에 SELECT 포함 전 권한** | 피드, 글 상세, 프로필 |
| `feed_posts` | definer | 위와 동일, `stock_id IS NULL` 최신순 | ⚠️ 동일 | (코드 직접 사용 없음, 정의만 유지) |
| `community_posts` | definer | 위와 동일, `stock_id IS NOT NULL` | ⚠️ 동일 | (코드 직접 사용 없음) |

⚠️ **2026-10-25 실측**: `posts` 테이블은 RLS로 anon 조회가 빈 배열이지만, 정의자 뷰 `posts_with_author`·`feed_posts`·`community_posts`는 anon 키만으로 `200 + 행`이 반환된다. "피드 읽기는 authenticated 전용" 정책(2026-07-20, CLAUDE.md)이 **뷰 경유로는 적용되지 않는 상태**. 화면은 `/feed`에서 비로그인 안내로 막혀 있으나 REST 직접 호출은 열려 있다. 동결 정책상 보안 hotfix 후보 — 조치는 `revoke all … from anon` + `grant select to authenticated`(#180과 같은 방식). Supabase Security Advisor의 "Security Definer View" 4건은 이 뷰들이다.

## 5. 스케줄 작업

| 종류 | 잡 | 스케줄 (UTC → KST) | 실행 내용 | 확인 방법 |
|---|---|---|---|---|
| pg_cron | `capture-asset-snapshots-daily` | `0 15 * * *` → 매일 00:00 | `capture_asset_snapshots()` — 전 계좌 KRW 평가금액 스냅샷 | `cron.job_run_details`, `asset_snapshots.snapshot_date` |
| pg_cron | `calculate-ranking-daily` | `5 0,15 * * *` → 매일 09:05·00:05 | `calculate_season_ranking(get_or_create_current_season())` | `season_rankings.updated_at`. 10/14 이후 연속 succeeded (#157) |
| Vercel Cron | `/api/cron/refresh-quotes` | `0 7 * * 1-5` → 평일 16:00~16:59 (Hobby ±59분) | 국내 목록 시세 일괄 갱신 | `price_quotes.fetched_at`, Observability → Cron Jobs(12시간 창). Logs는 1시간만 보관 |

- 분기 스냅샷 잡(`capture-asset-snapshots-quarterly`)은 `20260924000002`에서 unschedule됨. 운영 `cron.job`에는 위 2건만 active.
- 09:05 실행은 월초 공백 때문에 두었다 — `get_or_create_current_season()`이 `current_date`(UTC)로 월을 정해 새 시즌이 매월 1일 09:00 KST에 생기므로, 00:05 KST 실행만 있으면 1일 09:00 ~ 익일 00:05 동안 새 시즌 랭킹이 빈다. UTC 날짜가 바뀐 직후 한 번 더 돌려 공백을 5분으로 줄인다(#157).
- 자동화는 **첫 스케줄 실행 결과까지** 확인한 뒤 이슈를 닫는다(CLAUDE.md 8단계, #157·#166 사례).

## 6. 클라이언트 직접 접근 (참고)

라우트를 거치지 않고 브라우저에서 anon 키 + 사용자 JWT로 Supabase를 직접 읽는 테이블: `stocks`·`price_quotes`(전체 읽기), `accounts`·`holdings`·`transactions`·`asset_snapshots`·`watchlist_items`(본인만), `profiles`·`posts`·`comments`·`post_reactions`·`follows`·`seasons`·`rankings`(authenticated 읽기). 클라이언트 쓰기는 `posts`·`comments`·`post_reactions`·`follows`·`watchlist_items` INSERT/DELETE와 `profiles` UPDATE만 남아 있다. RLS 적용 테이블 17개.
