# 03. ERD — 데이터 모델

## 개요
12-테이블 코어 스키마 + 소셜 스키마.

## 테이블
- (users / accounts / holdings / orders / stocks / ...)
- (posts / comments / reactions / reposts / follows / ...)
- (seasons / rankings / asset_snapshots)

## 시즌 랭킹 데이터
- `seasons` — 활성 시즌은 항상 1개(`is_active` 유니크 인덱스). `get_or_create_current_season()`이 조회 시점에 생성. 현재 월 단위 → **분기 단위로 변경 예정** (#67 2/4)
- `rankings` — 시즌별 계좌 총자산 · 수익률 · 순위. `calculate_season_ranking()`으로 갱신
- `asset_snapshots` — `(account_id, snapshot_date)` 유니크, `snapshot_date`는 KST 날짜. 매일 00:00 KST cron + 계좌 생성 트리거로 기록, 한 번 기록되면 덮어쓰지 않음
  - 시즌 기준 자산 = 시즌 기간 안에서 가장 이른 스냅샷 (기존 유저: 분기 첫날 cron / 중간 가입자: 가입 시점)
- 총자산 = KRW 현금 + KRW 보유 수량 × 시세(없으면 평단가). USD 보유분은 제외 (#47)

## 관계
- ERD 다이어그램:

## RLS 정책 요약
- posts / comments / reactions / follows 등 행 수준 접근 통제 (authenticated 전용 읽기)
- `posts` 삭제: `posts_delete_own` (`auth.uid() = author_id`), 댓글·반응은 `on delete cascade`. 원글 삭제 시 리포스트의 `repost_of`는 null
- `seasons` / `rankings`: authenticated select. `season_rankings` 뷰는 `security_invoker = true`
- 스냅샷 함수(`account_total_assets_krw`, `capture_asset_snapshots`, `snapshot_new_account`)는 anon/authenticated `execute` 회수 — cron(postgres)과 트리거만 실행
- ⚠️ 알려진 이슈: `post_reactions` UPDATE RLS 정책 보완 필요 (#38)
