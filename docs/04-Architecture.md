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
- **피드 인기순 정렬**: `(likes - dislikes) + (comments × 2)` (시간 감쇠 없음)
