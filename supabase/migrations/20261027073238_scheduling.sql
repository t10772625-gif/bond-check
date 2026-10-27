-- Run after migrations and after creating the two Vault secrets described in RUNBOOK.md.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.poll_due(p_at timestamptz default now()) returns boolean
language sql immutable set search_path=public,pg_temp as $$
 select extract(hour from(p_at at time zone 'Asia/Karachi'))=6
 or extract(day from(p_at at time zone 'Asia/Karachi')) in(10,11,15,16,17)
 or (extract(day from(p_at at time zone 'Asia/Karachi')) between 9 and 22
     and mod(extract(hour from(p_at at time zone 'Asia/Karachi'))::integer,2)=0);
$$;
create or replace function public.call_pipeline(p_function text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare endpoint text;secret text;
begin
 if p_function not in('heartbeat','discover','worker') then raise exception 'Unknown scheduled function'; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='bondcheck_project_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='bondcheck_cron_secret';
 if endpoint is null or secret is null then raise exception 'BondCheck Vault settings are missing'; end if;
 perform net.http_post(url:=endpoint||'/functions/v1/'||p_function,
  headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',secret),body:='{}'::jsonb,
  timeout_milliseconds:=140000);
end $$;
revoke all on function public.call_pipeline(text) from public,anon,authenticated;
grant execute on function public.call_pipeline(text) to service_role;
revoke all on function public.poll_due(timestamptz) from public,anon,authenticated;

select cron.schedule('bondcheck-discover','17 * * * *',
 $$select public.call_pipeline('discover') where public.poll_due(now());$$);
select cron.schedule('bondcheck-worker','*/5 * * * *',
 $$select public.call_pipeline('worker') where exists(select 1 from public.ingest_jobs
    where (status='queued' and run_after<=now()) or(status='running' and locked_at<now()-interval '5 minutes'));$$);
select cron.schedule('bondcheck-heartbeat','13 2 * * *',
 $$select public.call_pipeline('heartbeat');$$);
select cron.schedule('bondcheck-watchdog','43 2 * * *',$$select public.watchdog();$$);
