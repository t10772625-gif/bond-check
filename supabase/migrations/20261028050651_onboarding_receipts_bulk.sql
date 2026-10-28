-- Personal portfolios share official results; only result administrators may edit that feed.
create table public.result_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.result_admins enable row level security;
insert into public.result_admins(user_id) select user_id from public.app_owners on conflict do nothing;
revoke all on public.result_admins from public,anon,authenticated;
grant all on public.result_admins to service_role;
create function public.is_result_admin() returns boolean language sql stable security definer
set search_path=public,pg_temp as $$select exists(select 1 from public.result_admins where user_id=auth.uid())$$;
revoke all on function public.is_result_admin() from public,anon;
grant execute on function public.is_result_admin() to authenticated,service_role;

create function public.enroll_confirmed_account() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
begin
  if new.email_confirmed_at is not null and nullif(trim(new.email),'') is not null then
    insert into public.app_owners(user_id) values(new.id) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.enroll_confirmed_account() from public,anon,authenticated;
create trigger bondcheck_enroll_verified after insert or update of email_confirmed_at on auth.users
for each row execute function public.enroll_confirmed_account();
insert into public.app_owners(user_id) select id from auth.users
where email_confirmed_at is not null and nullif(trim(email),'') is not null on conflict do nothing;

-- Financial state survives deletion/recreation of a derived match.
create table public.win_records (
  bond_id uuid not null references public.bonds(id) on delete cascade,
  draw_id uuid not null references public.draws(id) on delete cascade,
  claim_date date, claim_received bigint, acknowledged_at timestamptz,
  updated_at timestamptz not null default now(), primary key(bond_id,draw_id)
);
alter table public.win_records enable row level security;
create policy owner_records_read on public.win_records for select to authenticated using(
 public.is_app_owner() and exists(select 1 from public.bonds b where b.id=bond_id and b.owner_id=(select auth.uid()))
);
grant select on public.win_records to authenticated;
grant all on public.win_records to service_role;
insert into public.win_records(bond_id,draw_id,claim_date,claim_received,acknowledged_at)
select bond_id,draw_id,claim_date,claim_received,acknowledged_at from public.wins;
create function public.restore_win_record() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare saved public.win_records%rowtype;
begin
 select * into saved from public.win_records where bond_id=new.bond_id and draw_id=new.draw_id;
 if found then
   new.claim_date=saved.claim_date; new.claim_received=saved.claim_received;
   new.acknowledged_at=saved.acknowledged_at;
 end if;
 return new;
end $$;
create function public.persist_win_record() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
begin
 insert into public.win_records(bond_id,draw_id,claim_date,claim_received,acknowledged_at)
 values(new.bond_id,new.draw_id,new.claim_date,new.claim_received,new.acknowledged_at)
 on conflict(bond_id,draw_id) do update set claim_date=excluded.claim_date,
 claim_received=excluded.claim_received,acknowledged_at=excluded.acknowledged_at,updated_at=now();
 return new;
end $$;
revoke all on function public.restore_win_record(),public.persist_win_record() from public,anon,authenticated;
create trigger wins_restore_record before insert on public.wins for each row execute function public.restore_win_record();
create trigger wins_persist_record after insert or update on public.wins for each row execute function public.persist_win_record();

create or replace function public.mark_win(p_id uuid,p_claim_date date default null,p_received bigint default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare matched record;
begin
 if not public.is_app_owner() then raise exception 'Sign in to your account' using errcode='42501'; end if;
 select w.*,d.draw_date into matched from public.wins w join public.bonds b on b.id=w.bond_id
 join public.draws d on d.id=w.draw_id where w.id=p_id and b.owner_id=auth.uid() and b.deleted_at is null for update of w;
 if not found then raise exception 'Win not found'; end if;
 if p_claim_date is not null then
   if matched.provisional then raise exception 'Verify a possible win before recording a claim'; end if;
   if p_received is null or p_received<0 or p_received>9007199254740991 then raise exception 'Enter a valid non-negative amount actually received'; end if;
   if p_claim_date<matched.draw_date or p_claim_date>(now() at time zone 'Asia/Karachi')::date
     then raise exception 'Claim date must be between the draw date and today'; end if;
 elsif p_received is not null then raise exception 'A receipt requires a claim date';
 end if;
 update public.wins set acknowledged_at=now(),claim_date=p_claim_date,claim_received=p_received where id=p_id;
end $$;

create function public.trash_bonds(p_ids uuid[]) returns integer language plpgsql security definer
set search_path=public,pg_temp as $$
declare expected integer; changed integer;
begin
 if not public.is_app_owner() then raise exception 'Sign in to your account' using errcode='42501'; end if;
 select count(distinct x) into expected from unnest(p_ids) x;
 if expected<1 or expected>10000 or array_position(p_ids,null) is not null then raise exception 'Select between 1 and 10000 bonds'; end if;
 update public.bonds set deleted_at=now() where owner_id=auth.uid() and id=any(p_ids) and deleted_at is null;
 get diagnostics changed=row_count;
 if changed<>expected then raise exception 'Some selected bonds changed or do not belong to this account. Refresh and try again'; end if;
 return changed;
end $$;
revoke all on function public.trash_bonds(uuid[]) from public,anon;
grant execute on function public.trash_bonds(uuid[]) to authenticated;

do $$declare definition text;
begin
 definition:=pg_get_functiondef('public.approve_draw(uuid,jsonb,text,text)'::regprocedure);
 definition:=replace(definition,'if not public.is_app_owner() then','if not public.is_result_admin() then');
 execute definition;
 definition:=pg_get_functiondef('public.pipeline_status()'::regprocedure);
 definition:=replace(definition,'select jsonb_build_object(','select jsonb_build_object(''can_manage_results'',public.is_result_admin(),');
 execute definition;
 definition:=pg_get_functiondef('public.request_pipeline(text)'::regprocedure);
 definition:=replace(definition,'begin','begin if p_action<>''check'' and not public.is_result_admin() then raise exception ''Result administrator access required'' using errcode=''42501''; end if;');
 execute definition;
end $$;
create index if not exists wins_draw on public.wins(draw_id);
create index if not exists draw_files_draw on public.draw_files(draw_id);
create index if not exists win_records_draw on public.win_records(draw_id);
