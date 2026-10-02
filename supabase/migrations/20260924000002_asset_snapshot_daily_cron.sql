-- 스냅샷 cron을 분기 1회 → 매일 실행으로 변경 (#47)
--
-- 분기 첫날 1회만 돌면 그날 실행이 누락될 때 그 시즌 기준점이 통째로 사라진다.
-- capture_asset_snapshots()는 이미 있는 날짜를 덮어쓰지 않으므로 매일 돌려도
-- 기준점(시즌 내 최초 스냅샷)은 그대로이고, 누락되면 다음날 스냅샷이 대신한다.
--
-- 잡 이름이 스케줄과 맞도록 기존 잡을 지우고 새 이름으로 등록한다.
-- (unschedule은 없는 잡이면 에러이므로 cron.job에서 찾아서 지운다 → 재실행 안전)

select cron.unschedule(jobid)
from cron.job
where jobname = 'capture-asset-snapshots-quarterly';

-- 매일 00:00 KST = 15:00 UTC (pg_cron은 GMT 기준)
select cron.schedule(
  'capture-asset-snapshots-daily',
  '0 15 * * *',
  $$select public.capture_asset_snapshots()$$
);
