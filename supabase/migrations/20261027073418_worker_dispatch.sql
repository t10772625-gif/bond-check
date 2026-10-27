-- Bounded wake-ups drain backfills without waiting five minutes per draw.
create function public.dispatch_worker(p_chain integer default 0) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare endpoint text; secret text;
begin
 if p_chain < 0 or p_chain >= 8 then return; end if;
 if not exists(select 1 from public.ingest_jobs where attempts<6 and
   ((status='queued' and run_after<=now()) or
    (status='running' and locked_at<now()-interval '5 minutes'))) then return; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='bondcheck_project_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='bondcheck_cron_secret';
 if endpoint is null or secret is null then return; end if;
 perform net.http_post(url:=endpoint||'/functions/v1/worker',
   headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',secret),
   body:=jsonb_build_object('chain',p_chain+1),timeout_milliseconds:=140000);
end $$;
revoke all on function public.dispatch_worker(integer) from public,anon,authenticated;
grant execute on function public.dispatch_worker(integer) to service_role;
