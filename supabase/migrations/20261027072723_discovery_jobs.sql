alter table public.ingest_jobs drop constraint ingest_jobs_kind_check;
alter table public.ingest_jobs add constraint ingest_jobs_kind_check
 check(kind in('discover','ingest_draw','match_draw','rematch_bond','backfill','reconcile'));
