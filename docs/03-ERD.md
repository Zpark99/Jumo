# 03. ERD — 데이터 모델

## 개요
12-테이블 코어 스키마 + 소셜 스키마.

## 테이블
- (users / accounts / holdings / orders / stocks / ...)
- (posts / comments / reactions / reposts / follows / ...)
- (seasons / rankings / asset_snapshots)

## 랭킹 데이터
- `seasons` — 활성 시즌은 항상 1개(`is_active` 유니크 인덱스). `get_or_create_current_season()`이 조회 시점에 생성. 월 단위 내부 집계 단위이며 **화면에 노출하지 않는다** — v1.0 랭킹은 누적 수익률이라 시즌은 이름표일 뿐 (#67 결정 2026-10-10, 스키마 변경 없음)
- `rankings` — 계좌 총자산 · 가입 시드 대비 누적 수익률(`total_asset / initial_seed_krw - 1`) · 순위. `calculate_season_ranking()`으로 갱신
- `asset_snapshots` — `(account_id, snapshot_date)` 유니크, `snapshot_date`는 KST 날짜. 매일 00:00 KST cron + 계좌 생성 트리거로 기록, 한 번 기록되면 덮어쓰지 않음
  - 계좌 수익률 추이 그래프(#135)가 사용. 시즌 기준점 리셋을 재개(v2 #47)하면 이 스냅샷으로 기준 자산을 소급할 수 있다
- 총자산 = KRW 현금 + KRW 보유 수량 × 시세(없으면 평단가). USD 보유분은 제외 (#47)

## 관계
- ERD 다이어그램:

## RLS 정책 요약
- posts / comments / reactions / follows 등 행 수준 접근 통제 (authenticated 전용 읽기)
- `posts` 삭제: `posts_delete_own` (`auth.uid() = author_id`), 댓글·반응은 `on delete cascade`. 원글 삭제 시 리포스트의 `repost_of`는 null
- `seasons` / `rankings`: authenticated select. `season_rankings` 뷰는 `security_invoker = true`
- 스냅샷 함수(`account_total_assets_krw`, `capture_asset_snapshots`, `snapshot_new_account`)는 anon/authenticated `execute` 회수 — cron(postgres)과 트리거만 실행
- ⚠️ 알려진 이슈: `post_reactions` UPDATE RLS 정책 보완 필요 (#38)
