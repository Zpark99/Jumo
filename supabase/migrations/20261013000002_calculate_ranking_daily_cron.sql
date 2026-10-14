-- 랭킹 자동 집계 cron (#157)
--
-- capture-asset-snapshots-daily(00:00 KST)는 asset_snapshots만 적재하고,
-- calculate_season_ranking은 /ranking의 수동 버튼으로만 실행됐다. 그래서
-- season_rankings·홈 '내 투자' 카드가 2026-10-02 이후 갱신되지 않았다.
-- 계산식·테이블은 그대로, 잡 등록만 추가한다.
--
-- 하루 2회 (pg_cron은 GMT 기준):
--   15:05 UTC = 00:05 KST — 스냅샷 직후 집계
--   00:05 UTC = 09:05 KST — get_or_create_current_season()이 current_date(UTC)로
--     월을 정하므로 새 시즌은 매월 1일 09:00 KST에 생긴다. 00:05 KST 실행만 있으면
--     1일 09:00 ~ 익일 00:05 동안 새 시즌 랭킹이 비어 홈 '내 투자'까지 빈 상태가
--     된다. UTC 날짜가 바뀐 직후 한 번 더 돌려 그 공백을 5분으로 줄인다.
--     평소엔 오전에 한 번 더 재계산할 뿐이라 부작용 없음.
--
-- 재실행 안전: 같은 이름의 잡이 있으면 먼저 지운다(20260924000002와 같은 패턴).
-- cron 명령은 postgres(함수 소유자)로 실행되므로 authenticated 전용 GRANT와 무관.

select cron.unschedule(jobid)
from cron.job
where jobname = 'calculate-ranking-daily';

select cron.schedule(
  'calculate-ranking-daily',
  '5 0,15 * * *',
  $$select public.calculate_season_ranking(public.get_or_create_current_season())$$
);
