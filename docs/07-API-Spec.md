# 07. API 명세

## KIS Open API 연동
- 인증/토큰: `POST /oauth2/tokenP` → `get_kis_token`/`upsert_kis_token` RPC로 캐싱. 웹소켓은 `POST /oauth2/Approval`로 `approval_key` 별도 발급 (**브라우저에 내리면 안 됨** → 서버 릴레이 필요, #119)
- BASE_URL: **실전** `openapi.koreainvestment.com:9443`. 시세·캔들·호가는 VTS(모의) 도메인에서 `EGW00103`으로 거부됨 (#39)
- 공통 헤더: `authorization: Bearer <token>`, `appkey`, `appsecret`, `tr_id`, `custtype: P`
- rate limit: **초당 2건** (초과 시 `EGW00201`) — 다건 조회는 순차 + 캐시
- 지연 시세 처리: 화면에 "지연 시세" 라벨 명시. 현재가는 50초 DB 캐시(`QUOTE_CACHE_TTL_MS`) → `execute_order`의 `v_quote_max_age`(60초)보다 짧게 유지

### 가용성 (2026-10-08 실측)

| 용도 | 엔드포인트 / TR | 상태 |
|---|---|---|
| 국내 현재가 | `domestic-stock/v1/quotations/inquire-price` / `FHKST01010100` | ✅ 사용 중 |
| 국내 호가 10단 | `domestic-stock/v1/quotations/inquire-asking-price-exp-ccn` / `FHKST01010200` | ✅ 사용 중 (#87) |
| 국내 일·주·월봉 | `domestic-stock/v1/quotations/inquire-daily-itemchartprice` / `FHKST03010100` (`FID_PERIOD_DIV_CODE`=`D`/`W`/`M`) | ✅ 사용 중 (#112 일/주/월) |
| 국내 분봉 | `domestic-stock/v1/quotations/inquire-time-itemchartprice` / `FHKST03010200` | ⏳ 가용·미구현. **1회 30건 제한** → 반복 호출+병합 (#112) |
| 국내지수 | `domestic-stock/v1/quotations/inquire-index-price` / `FHPUP02100000` (`FID_COND_MRKT_DIV_CODE`=`U`, 업종코드 `0001` 코스피 / `1001` 코스닥) | ✅ 사용 중 (#108) |
| 실시간 체결가·호가 | `ws://ops.koreainvestment.com:21000` / `H0STCNT0`·`H0STASP0` | ⏳ 구독 성공·미구현 (#119) |
| **해외 전부** (주식·지수·환율) | `overseas-price/v1/quotations/price` / `HHDFS00000300` 등 | ❌ `EGW02004` — **해외 권한 없음**. KIS 해외주식 API 신청 선행 (#120) |

## 내부 RPC
- `execute_order` — 주문 체결 (비관적 락)
- `get_kis_token` / `upsert_kis_token` — KIS 토큰 캐싱 (`SECURITY DEFINER`, `service_role` 전용)
- `upsert_price_quote` — 시세 캐시 갱신. `price_quotes.price > 0` CHECK로 0 이하 저장 시 `23514` 거부 (#121)
- `get_or_create_current_season()` — 현재 집계 단위(월) 조회/생성. 분기 변경은 기각, 화면 미노출 (#67)
- `calculate_season_ranking(p_season_id)` — 누적 수익률 랭킹 계산 (`total_asset / initial_seed_krw - 1`, #67 확정)
- `account_total_assets_krw()` — 계좌별 총자산(KRW). 내부 전용, anon/authenticated 실행 불가
- `capture_asset_snapshots()` — 전체 계좌 스냅샷, cron 전용 (`capture-asset-snapshots-daily`, `0 15 * * *` UTC = 매일 00:00 KST)

## 데이터 계약 / 엔드포인트
- `GET /api/quote/[stockId]` — 종목 시세. `price <= 0`이면 저장·반환 거부(`QUOTE_NOT_FOUND`) (#121)
- `GET /api/candles/[stockId]?period=D|W|M` — 캔들 (차트 탭). `period` 미지정·비정상 값은 `D` 폴백. 100봉을 채우도록 기간별 조회 구간 분리(주봉 800일 / 월봉 3650일) (#112)
- `GET /api/indices` — 코스피·코스닥 지수(`value`·`change`·`changePct`). 비로그인 허용. 서버 캐시 60초(`INDEX_CACHE_TTL_SEC`, Next 데이터 캐시)로 KIS 호출을 TTL당 2건(순차, 600ms 간격)으로 상한. `rt_cd=0`인데 값이 비거나 0 이하면 해당 지수 `value: null`(화면 "-"), 실패도 TTL 동안 캐시. 토큰 실패 시 503 `INDEX_UNAVAILABLE` (#108)
- `GET /api/orderbook/[stockId]` — 10단 호가 + 잔량. 표시 순서는 매도 `askp10→1`, 매수 `bidp1→10`. 해외는 `SUPPORTED_MARKETS`로 차단(`ORDERBOOK_NOT_SUPPORTED`), `rt_cd=0`인데 값이 빈 응답은 0 이하·비숫자 호가를 버리고 전부 비면 404 (#87, #120)
