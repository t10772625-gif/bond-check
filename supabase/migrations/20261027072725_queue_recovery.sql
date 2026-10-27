-- Reuse failed jobs rather than accumulating permanently failing duplicate rows.
create or replace function public.enqueue_job(p_kind text,p_payload jsonb default '{}') returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare failed_id bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_kind||p_payload::text,0));
 update public.ingest_jobs set rerun_requested=true where kind=p_kind and payload=p_payload and status='running';
 if found then return; end if;
 if exists(select 1 from public.ingest_jobs where kind=p_kind and payload=p_payload and status='queued') then return; end if;
 select id into failed_id from public.ingest_jobs where kind=p_kind and payload=p_payload and status='failed'
 order by id desc limit 1 for update;
 if found then
  update public.ingest_jobs set status='queued',attempts=0,run_after=now(),locked_at=null,lease_token=null where id=failed_id;
 else
  insert into public.ingest_jobs(kind,payload) values(p_kind,p_payload) on conflict do nothing;
 end if;
end $$;
create or replace function public.request_pipeline(p_action text default 'check') returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare job record;
begin
 if not public.is_app_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 if p_action not in('check','backfill','reconcile','retry') then raise exception 'Invalid action'; end if;
 if p_action='retry' then
  for job in select distinct kind,payload from public.ingest_jobs where status='failed' loop
   perform public.enqueue_job(job.kind,job.payload);
  end loop;
 else
  perform public.enqueue_job(case when p_action='check' then 'reconcile' else p_action end,'{}');
 end if;
end $$;
