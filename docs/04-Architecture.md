# 04. 아키텍처 · 기술 결정

## 시스템 구성
- Frontend: Next.js (App Router) + TypeScript + Tailwind CSS
- Backend/DB: Supabase (PostgreSQL, RLS, RPC)
- Data: KIS Open API (주력), Finnhub (미국 백업)
- Infra: Vercel

## 데이터 흐름
- 시세: KIS → (캐싱/프록시) → 클라이언트
- 주문: 클라이언트 → RPC → DB

## 기술 결정
- **주문 체결 정합성 — 비관적 락**: `execute_order` RPC에서 `SELECT ... FOR UPDATE`로 잔고·포지션 잠금 후 체결 (동시 주문 시 초과·중복 체결 방지)
- **KIS 토큰 보안 캐싱**: `SECURITY DEFINER` RPC로 토큰 캐싱, `service_role`만 접근 (클라이언트 비노출)
- **행 수준 보안(RLS)**: 사용자 데이터 접근 행 단위 통제
- **시세·현금 정책**: 지연 시세 명시 라벨링, KRW/USD 현금 분리 보관
- **피드 인기순 정렬**: `(likes - dislikes) + (comments × 2)` (시간 감쇠 없음) — 잠정, 확정 대기 (#32)
- **시즌 기준 자산 스냅샷**: `pg_cron`이 매일 00:00 KST `capture_asset_snapshots()` 실행 + 계좌 생성 트리거. KST 날짜로 기록해 UTC 기준 시즌 경계와 무관하게 동작하고, `on conflict do nothing`이라 기준점이 바뀌지 않음(그날 누락되면 다음날 스냅샷이 대체). 기준 자산과 현재 자산은 `account_total_assets_krw()` 한 함수로 계산 (#47, #67)
- **다크 모드**: `.dark` 클래스 기반(`@custom-variant dark`). 현재 `<html class="dark">` 고정으로 기본 다크, 서버 렌더에 포함돼 첫 페인트 깜빡임 없음. 토글은 미구현 (#51)
