# 07. API 명세

## KIS Open API 연동
- 인증/토큰:
- 시세 조회:
- 지연 시세 처리:

## 내부 RPC
- `execute_order` — 주문 체결 (비관적 락)
- `get_kis_token` / `upsert_kis_token` — KIS 토큰 캐싱 (`SECURITY DEFINER`, `service_role` 전용)
- `upsert_price_quote` — 시세 캐시 갱신
- `get_or_create_current_season()` — 현재 시즌 조회/생성 (월 → 분기 변경 예정, #67)
- `calculate_season_ranking(p_season_id)` — 시즌 랭킹 계산 (기준을 시즌 내 최초 스냅샷으로 변경 예정, #67)
- `account_total_assets_krw()` — 계좌별 총자산(KRW). 내부 전용, anon/authenticated 실행 불가
- `capture_asset_snapshots()` — 전체 계좌 스냅샷, cron 전용 (`capture-asset-snapshots-daily`, `0 15 * * *` UTC = 매일 00:00 KST)

## 데이터 계약 / 엔드포인트
- `GET /api/quote/[stockId]` — 종목 시세
- `GET /api/candles/[stockId]` — 일봉 (차트 탭)
