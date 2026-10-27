-- Single-owner prize-bond automation. All matching is performed in PostgreSQL.
create table public.app_owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);
-- Existing projects with several accounts require an explicit owner assignment.
insert into public.app_owners(user_id)
select id from auth.users where (select count(*) from auth.users) = 1;

create function public.is_app_owner() returns boolean language sql stable
security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.app_owners where user_id = auth.uid());
$$;

create table public.sources (
  denomination integer primary key check (denomination in (100,200,750,1500,25000,40000)),
  list_url text check (list_url ~ '^https://(www\.)?savings\.gov\.pk/'),
  is_premium boolean not null default false,
  active boolean not null default true,
  etag text, last_modified text, last_discovered_at timestamptz,
  last_link_count integer not null default 0
);
insert into public.sources(denomination,list_url,is_premium) values
 (100,null,false),(200,null,false),
 (750,'https://savings.gov.pk/rs-750-prize-bond-draw/',false),
 (1500,null,false),(25000,null,true),(40000,null,true);

create table public.prize_structures (
  id bigint generated always as identity primary key,
  denomination integer not null references public.sources(denomination),
  from_draw_no integer not null default 0,
  first_count integer not null check(first_count>0),
  second_count integer not null check(second_count>0),
  third_count integer check(third_count>0),
  first_amount bigint not null, second_amount bigint not null, third_amount bigint not null,
  note text, unique(denomination,from_draw_no)
);
insert into public.prize_structures
 (denomination,from_draw_no,first_count,second_count,third_count,first_amount,second_amount,third_amount,note) values
 (100,0,1,3,1696,700000,200000,1000,'Before draw 51; confirm historical changes'),
 (100,51,1,3,1199,700000,200000,1000,'From draw 51'),
 (200,0,1,5,2394,750000,250000,1250,''),
 (750,0,1,3,1696,1500000,500000,9300,''),
 (1500,0,1,3,1696,3000000,1000000,18500,''),
 (25000,0,2,5,700,30000000,10000000,300000,'Two first prizes'),
 (40000,0,1,3,660,80000000,30000000,500000,'');

create table public.bonds (
  id uuid primary key default gen_random_uuid(),
  local_id bigint generated always as identity unique,
  owner_id uuid not null default auth.uid() references auth.users(id),
  denomination integer not null references public.sources(denomination),
  number char(6) not null check(number ~ '^[0-9]{6}$'),
  series text not null default '' check(series ~ '^[A-Z]*$'),
  purchased_on date, note text not null default '', holder text not null default '',
  legacy_id text, archived boolean not null default false, deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_id,legacy_id), unique(owner_id,denomination,series,number)
);
create index bonds_lookup on public.bonds(denomination,number);

create table public.draws (
  id uuid primary key default gen_random_uuid(),
  denomination integer not null references public.sources(denomination),
  draw_date date not null, draw_no integer, held_on date,
  status text not null default 'pending' check(status in
    ('pending','ok','ok_manual','needs_review','needs_ocr','incomplete','failed','superseded')),
  accepted_file_id uuid, decision_note text, approved_file_sha256 text,
  parsed_counts jsonb not null default '{}', issues jsonb not null default '[]',
  warnings jsonb not null default '[]', suspects jsonb not null default '[]',
  first_seen_at timestamptz not null default now(), ingested_at timestamptz,
  unique(denomination,draw_date)
);
create table public.draw_files (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws(id) on delete cascade,
  url text not null unique, kind text not null check(kind in('txt','xlsx','xls','pdf','docx','doc','manual')),
  label text not null default '', is_revised boolean not null default false,
  sha256 text, storage_path text, bytes integer, http_status integer,
  etag text,last_modified text,fetched_at timestamptz,
  parse_status text not null default 'pending' check(parse_status in
    ('pending','ok','review','failed','skipped','needs_ocr','superseded')),
  parsed_counts jsonb, issues jsonb, warnings jsonb
);
alter table public.draws add constraint accepted_file_fk
 foreign key(accepted_file_id) references public.draw_files(id);
create table public.draw_file_versions (
  file_id uuid not null references public.draw_files(id) on delete cascade,
  sha256 text not null, storage_path text not null, bytes integer not null,
  created_at timestamptz not null default now(), primary key(file_id,sha256)
);
create table public.draw_numbers (
  draw_id uuid not null references public.draws(id) on delete cascade,
  number char(6) not null check(number ~ '^[0-9]{6}$'),
  tier smallint not null check(tier between 1 and 3),
  provisional boolean not null default false, primary key(draw_id,number)
);
create index draw_numbers_lookup on public.draw_numbers(number,draw_id);
create table public.wins (
  id uuid primary key default gen_random_uuid(),
  bond_id uuid not null references public.bonds(id) on delete cascade,
  draw_id uuid not null references public.draws(id) on delete cascade,
  tier smallint not null check(tier between 1 and 3), prize_amount bigint,
  provisional boolean not null default false, confirmed_by_official_search boolean,
  created_at timestamptz not null default now(), acknowledged_at timestamptz,
  claim_date date, claim_received bigint, unique(bond_id,draw_id)
);
create table public.draw_checks (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id),
  draw_id uuid not null references public.draws(id) on delete cascade,
  file_id uuid references public.draw_files(id),run_at timestamptz not null default now(),
  bonds_checked integer not null,wins integer not null,possible integer not null
);
create index draw_checks_latest on public.draw_checks(owner_id,draw_id,run_at desc);
create table public.ingest_jobs (
  id bigint generated always as identity primary key,
  kind text not null check(kind in('ingest_draw','match_draw','rematch_bond','backfill','reconcile')),
  payload jsonb not null default '{}',
  status text not null default 'queued' check(status in('queued','running','done','failed')),
  attempts integer not null default 0,run_after timestamptz not null default now(),
  locked_at timestamptz,lease_token uuid,last_error text,created_at timestamptz not null default now(),
  rerun_requested boolean not null default false
);
create unique index ingest_jobs_dedupe on public.ingest_jobs(kind,(payload::text))
 where status in('queued','running');
create index ingest_jobs_runnable on public.ingest_jobs(status,run_after);
create table public.pipeline_events (
  id bigint generated always as identity primary key,at timestamptz not null default now(),
  level text not null check(level in('info','warning','error')),kind text not null,
  draw_id uuid references public.draws(id) on delete set null,message text not null,data jsonb
);
create table public.heartbeat (
  id integer primary key default 1 check(id=1),last_beat timestamptz,
  last_discovery_ok timestamptz,last_ingest_ok timestamptz,last_device_sync timestamptz
);
insert into public.heartbeat(id) values(1);

create function public.enqueue_job(p_kind text,p_payload jsonb default '{}') returns void
language sql security definer set search_path=public,pg_temp as $$
 insert into public.ingest_jobs(kind,payload) values(p_kind,p_payload) on conflict do nothing;
$$;

create function public.recompute_matches(p_draw uuid default null,p_bond uuid default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 delete from public.wins w using public.bonds b where w.bond_id=b.id
 and (p_draw is null or w.draw_id=p_draw) and (p_bond is null or b.id=p_bond)
 and not exists(select 1 from public.draws d join public.draw_numbers n on n.draw_id=d.id
   where d.id=w.draw_id and d.denomination=b.denomination and n.number=b.number
   and d.status in('ok','ok_manual','needs_review') and b.deleted_at is null);

 insert into public.wins(bond_id,draw_id,tier,prize_amount,provisional)
 select b.id,d.id,n.tier,
   case n.tier when 1 then ps.first_amount when 2 then ps.second_amount else ps.third_amount end,
   n.provisional or d.status='needs_review'
 from public.draws d join public.draw_numbers n on n.draw_id=d.id
 join public.bonds b on b.denomination=d.denomination and b.number=n.number
 left join lateral(select * from public.prize_structures p where p.denomination=d.denomination
   and p.from_draw_no<=coalesce(d.draw_no,0) order by p.from_draw_no desc limit 1) ps on true
 where d.status in('ok','ok_manual','needs_review') and b.deleted_at is null
   and (p_draw is null or d.id=p_draw) and (p_bond is null or b.id=p_bond)
 on conflict(bond_id,draw_id) do update set tier=excluded.tier,
   prize_amount=excluded.prize_amount,provisional=excluded.provisional,
   acknowledged_at=case when wins.tier=excluded.tier and wins.provisional=excluded.provisional
      and wins.prize_amount is not distinct from excluded.prize_amount
      then wins.acknowledged_at else null end;

 insert into public.draw_checks(owner_id,draw_id,file_id,bonds_checked,wins,possible)
 select b.owner_id,d.id,d.accepted_file_id,count(b.id)::integer,
   count(w.id) filter(where not w.provisional)::integer,
   count(w.id) filter(where w.provisional)::integer
 from public.draws d join public.bonds b on b.denomination=d.denomination and b.deleted_at is null
 left join public.wins w on w.bond_id=b.id and w.draw_id=d.id
 where (p_draw is null or d.id=p_draw) and (p_bond is null or b.owner_id=(select owner_id from public.bonds where id=p_bond))
 and d.status in('ok','ok_manual','needs_review') group by b.owner_id,d.id;
end $$;

create function public.bond_changed() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
begin
 new.updated_at=now();
 return new;
end $$;
create trigger bonds_timestamp before update on public.bonds for each row execute function public.bond_changed();
create function public.bond_rematch() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
begin
 perform public.recompute_matches(null,new.id);
 return new;
end $$;
create trigger bonds_rematch after insert or update of number,denomination,deleted_at on public.bonds
 for each row execute function public.bond_rematch();

create function public.claim_jobs(p_limit integer default 1) returns setof public.ingest_jobs
language sql security definer set search_path=public,pg_temp as $$
 with candidates as (
 select id from public.ingest_jobs where attempts<6 and
 ((status='queued' and run_after<=now()) or (status='running' and locked_at<now()-interval '5 minutes'))
 order by created_at for update skip locked limit least(greatest(p_limit,1),3)
 ) update public.ingest_jobs j set status='running',locked_at=now(),lease_token=gen_random_uuid(),attempts=attempts+1,rerun_requested=false
 from candidates c where j.id=c.id returning j.*;
$$;
create function public.finish_job(p_id bigint,p_lease uuid,p_error text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.ingest_jobs set
 status=case when p_error is null and rerun_requested then 'queued'
  when p_error is null then 'done' when attempts>=6 then 'failed' else 'queued' end,
 last_error=left(p_error,1000),locked_at=null,lease_token=null,
 run_after=case when p_error is null and rerun_requested then now() else now()+case attempts when 1 then interval '1 minute' when 2 then interval '5 minutes'
  when 3 then interval '30 minutes' else interval '3 hours' end end,
 attempts=case when p_error is null and rerun_requested then 0 else attempts end,
 rerun_requested=false
 where id=p_id and lease_token=p_lease;
end $$;

create function public.replace_draw_result(
 p_draw uuid,p_file uuid,p_status text,p_numbers jsonb,p_counts jsonb,p_issues jsonb,
 p_warnings jsonb,p_suspects jsonb,p_draw_no integer default null,p_held_on date default null,p_sha256 text default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare old_file uuid; changed boolean;
begin
 select accepted_file_id into old_file from public.draws where id=p_draw for update;
 if not found then raise exception 'Unknown draw'; end if;
 if p_file is not null and not exists(select 1 from public.draw_files where id=p_file and draw_id=p_draw)
 then raise exception 'File does not belong to draw'; end if;
 if p_file is not null and (p_sha256 is null or p_sha256 is distinct from (select sha256 from public.draw_files where id=p_file))
 then raise exception 'File changed during ingestion; retry the job'; end if;
 if exists(select 1 from public.draws where id=p_draw and status='ok_manual'
  and accepted_file_id=p_file and approved_file_sha256=p_sha256) then return; end if;
 if p_status not in('ok','needs_review','needs_ocr','incomplete','failed') then raise exception 'Invalid status'; end if;
 if jsonb_array_length(p_numbers)>5000 then raise exception 'Too many numbers'; end if;
 if p_status='ok' and (jsonb_array_length(p_issues)>0 or jsonb_array_length(p_suspects)>0)
 then raise exception 'Unresolved issues cannot be verified'; end if;
 changed=exists(
   (select number::text,tier,provisional from public.draw_numbers where draw_id=p_draw
    except select x.number,x.tier,x.provisional from jsonb_to_recordset(p_numbers) as x(number text,tier smallint,provisional boolean))
   union all
   (select x.number,x.tier,x.provisional from jsonb_to_recordset(p_numbers) as x(number text,tier smallint,provisional boolean)
    except select number::text,tier,provisional from public.draw_numbers where draw_id=p_draw)
 );
 if old_file is not null and old_file is distinct from p_file then
  update public.draw_files set parse_status='superseded' where id=old_file;
 end if;
 delete from public.draw_numbers where draw_id=p_draw;
 insert into public.draw_numbers(draw_id,number,tier,provisional)
 select p_draw,x.number,x.tier,coalesce(x.provisional,false)
 from jsonb_to_recordset(p_numbers) as x(number text,tier smallint,provisional boolean);
 update public.draws set accepted_file_id=p_file,status=p_status,parsed_counts=p_counts,
  issues=p_issues,warnings=p_warnings,suspects=p_suspects,draw_no=coalesce(p_draw_no,draw_no),
  held_on=p_held_on,ingested_at=now() where id=p_draw;
 perform public.recompute_matches(p_draw,null);
 if changed and old_file is not null then
  insert into public.pipeline_events(level,kind,draw_id,message)
   values('warning','result_corrected',p_draw,'Published result changed; matches were recomputed.');
 end if;
 update public.heartbeat set last_ingest_ok=now() where id=1;
end $$;

create function public.check_my_history() returns void language plpgsql security definer
set search_path=public,pg_temp as $$
declare b record;
begin
 if not public.is_app_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 for b in select id from public.bonds where owner_id=auth.uid() loop
  perform public.recompute_matches(null,b.id);
 end loop;
end $$;
create function public.request_pipeline(p_action text default 'check') returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_app_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 if p_action not in('check','backfill','reconcile','retry') then raise exception 'Invalid action'; end if;
 if p_action='retry' then
  update public.ingest_jobs set status='queued',attempts=0,run_after=now(),last_error=null
  where status='failed' and not exists(select 1 from public.ingest_jobs j2
   where j2.kind=ingest_jobs.kind and j2.payload=ingest_jobs.payload and j2.status in('queued','running'));
 else
  perform public.enqueue_job(case when p_action='check' then 'reconcile' else p_action end,'{}');
 end if;
end $$;
create function public.mark_win(p_id uuid,p_claim_date date default null,p_received bigint default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_app_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 update public.wins w set acknowledged_at=now(),claim_date=p_claim_date,claim_received=p_received
 from public.bonds b where b.id=w.bond_id and b.owner_id=auth.uid() and w.id=p_id;
 if not found then raise exception 'Win not found'; end if;
end $$;
create function public.approve_draw(p_draw uuid,p_numbers jsonb,p_note text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_app_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 if length(trim(p_note))<8 then raise exception 'Describe how the official file was verified'; end if;
 perform 1 from public.draws where id=p_draw for update;
 if not found then raise exception 'Draw not found'; end if;
 if jsonb_array_length(p_numbers)<1 or jsonb_array_length(p_numbers)>5000 then raise exception 'Invalid number count'; end if;
 delete from public.draw_numbers where draw_id=p_draw;
 insert into public.draw_numbers(draw_id,number,tier,provisional)
 select p_draw,x.number,x.tier,false from jsonb_to_recordset(p_numbers) as x(number text,tier smallint);
 update public.draws set status='ok_manual',decision_note=p_note,ingested_at=now(),
  approved_file_sha256=(select sha256 from public.draw_files where id=(select accepted_file_id from public.draws where id=p_draw)) where id=p_draw;
 perform public.recompute_matches(p_draw,null);
 insert into public.pipeline_events(level,kind,draw_id,message,data)
 values('warning','manual_approval',p_draw,p_note,jsonb_build_object('actor',auth.uid(),'count',jsonb_array_length(p_numbers)));
end $$;

-- Security definer summaries expose aggregates, not operational credentials or other users' bonds.
create function public.pipeline_status() returns jsonb language plpgsql stable security definer
set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.is_app_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 select jsonb_build_object(
  'total',(select count(*) from public.draws),
  'verified',(select count(*) from public.draws where status in('ok','ok_manual')),
  'attention',(select count(*) from public.draws where status not in('ok','ok_manual')),
  'pending_jobs',(select count(*) from public.ingest_jobs where status in('queued','running')),
  'failed_jobs',(select count(*) from public.ingest_jobs where status='failed'),
  'missing_sources',(select count(*) from public.sources where active and (list_url is null or last_discovered_at is null)),
  'heartbeat',(select to_jsonb(h) from public.heartbeat h where id=1),
  'unacknowledged',(select count(*) from public.wins w join public.bonds b on b.id=w.bond_id
     where b.owner_id=auth.uid() and w.acknowledged_at is null),
  'events',coalesce((select jsonb_agg(e) from(select at,level,kind,draw_id,message from public.pipeline_events
    where kind in('result_corrected','watchdog','discovery_failed','download_failed') order by at desc limit 30)e),'[]'::jsonb)
 ) into result;
 return result;
end $$;
create view public.v_status with(security_invoker=true) as select public.pipeline_status() as status;

create function public.watchdog() returns void language plpgsql security definer
set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.heartbeat where last_discovery_ok is null or last_discovery_ok<now()-interval '3 days') then
  insert into public.pipeline_events(level,kind,message) values('error','watchdog','No successful discovery in the last three days.');
 end if;
 update public.ingest_jobs set status='failed',last_error='Worker lease expired after the maximum retry count',
 locked_at=null,lease_token=null where status='running' and attempts>=6 and locked_at<now()-interval '5 minutes';
 delete from public.pipeline_events where at<now()-interval '12 months';
end $$;

-- RLS is enabled on every table, including operational tables with no client policies.
do $$declare t text;begin
 foreach t in array array['app_owners','sources','prize_structures','bonds','draws','draw_files',
 'draw_file_versions','draw_numbers','wins','draw_checks','ingest_jobs','pipeline_events','heartbeat'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
 foreach t in array array['sources','prize_structures','draws','draw_files','draw_file_versions','draw_numbers','heartbeat'] loop
  execute format('create policy owner_read on public.%I for select to authenticated using(public.is_app_owner())',t);
 end loop;
end $$;
create policy bonds_owner on public.bonds for all to authenticated
 using(owner_id=auth.uid() and public.is_app_owner())
 with check(owner_id=auth.uid() and public.is_app_owner());
create policy wins_read on public.wins for select to authenticated
 using(public.is_app_owner() and exists(select 1 from public.bonds b where b.id=bond_id and b.owner_id=auth.uid()));
create policy checks_read on public.draw_checks for select to authenticated
 using(public.is_app_owner() and owner_id=auth.uid());

-- Revoke the default PUBLIC execute privilege on every new security-definer RPC.
revoke all on function public.is_app_owner() from public;
grant execute on function public.is_app_owner() to authenticated,service_role;
revoke all on function public.enqueue_job(text,jsonb),public.recompute_matches(uuid,uuid),
 public.claim_jobs(integer),public.finish_job(bigint,uuid,text),
 public.replace_draw_result(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,integer,date,text),
 public.bond_changed(),public.bond_rematch(),public.watchdog() from public,anon,authenticated;
grant execute on function public.enqueue_job(text,jsonb),public.recompute_matches(uuid,uuid),
 public.claim_jobs(integer),public.finish_job(bigint,uuid,text),
 public.replace_draw_result(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,integer,date,text),public.watchdog() to service_role;
revoke all on function public.check_my_history(),public.request_pipeline(text),
 public.mark_win(uuid,date,bigint),public.approve_draw(uuid,jsonb,text),public.pipeline_status() from public,anon;
grant execute on function public.check_my_history(),public.request_pipeline(text),
 public.mark_win(uuid,date,bigint),public.approve_draw(uuid,jsonb,text),public.pipeline_status() to authenticated;
grant select,insert,update,delete on public.bonds to authenticated;
grant usage,select on sequence public.bonds_local_id_seq to authenticated;
grant select on public.sources,public.prize_structures,public.draws,public.draw_files,
 public.draw_file_versions,public.draw_numbers,public.wins,public.draw_checks,public.heartbeat,public.v_status to authenticated;
grant all on public.app_owners,public.sources,public.prize_structures,public.bonds,public.draws,
 public.draw_files,public.draw_file_versions,public.draw_numbers,public.wins,public.draw_checks,
 public.ingest_jobs,public.pipeline_events,public.heartbeat to service_role;
grant usage,select on sequence public.bonds_local_id_seq,public.prize_structures_id_seq,
 public.draw_checks_id_seq,public.ingest_jobs_id_seq,public.pipeline_events_id_seq to service_role;

insert into storage.buckets(id,name,public,file_size_limit)
 values('draw-raw','draw-raw',false,5242880),('bond-backups','bond-backups',false,5242880)
 on conflict(id) do update set public=false,file_size_limit=5242880;
create policy backup_owner_read on storage.objects for select to authenticated
 using(bucket_id='bond-backups' and public.is_app_owner() and (storage.foldername(name))[1]=auth.uid()::text);
create policy backup_owner_insert on storage.objects for insert to authenticated
 with check(bucket_id='bond-backups' and public.is_app_owner() and (storage.foldername(name))[1]=auth.uid()::text);
