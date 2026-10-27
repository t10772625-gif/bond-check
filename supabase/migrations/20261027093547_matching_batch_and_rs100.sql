-- Official Rs100 files from draw 25 (2019) onward declare 1,199 third prizes.
-- Evidence: 15-02-2019-Rs-100.txt; 15-11-2014-Rs-100.txt (list/header date 2024);
-- Rs.100-49th-Draw-RWP-Final.txt; Draw-Result-100-50th.txt. Raw hashes in audit.
insert into public.prize_structures(denomination,from_draw_no,first_count,second_count,third_count,first_amount,second_amount,third_amount,note)
values(100,25,1,3,1199,700000,200000,1000,'Verified against official draws 25,48,49,50; supplied spec transition at 51 was incorrect')
on conflict(denomination,from_draw_no) do update set third_count=excluded.third_count,note=excluded.note;
create or replace function public.recompute_matches(p_draw uuid default null,p_bond uuid default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('bondcheck_matches',0));
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
create or replace function public.replace_draw_result(
 p_draw uuid,p_file uuid,p_status text,p_numbers jsonb,p_counts jsonb,p_issues jsonb,
 p_warnings jsonb,p_suspects jsonb,p_draw_no integer default null,p_held_on date default null,p_sha256 text default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare old_file uuid; changed boolean; structure record; counts record;
begin
 perform pg_advisory_xact_lock(hashtextextended('bondcheck_matches',0));
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

 if p_file is null and p_status in('failed','incomplete','needs_ocr')
  and exists(select 1 from public.draw_numbers where draw_id=p_draw) then
  update public.draws set status='needs_review',
   issues=p_issues||'["Refresh failed; previous result retained provisionally"]'::jsonb
   where id=p_draw;
  perform public.recompute_matches(p_draw,null);
  return;
 end if;
 if p_status='ok' then
  select p.* into structure from public.prize_structures p join public.draws d on d.denomination=p.denomination
   where d.id=p_draw and p.from_draw_no<=coalesce(p_draw_no,d.draw_no,0)
   order by p.from_draw_no desc limit 1;
  if structure.id is null or structure.third_count is null then raise exception 'Prize structure is not configured'; end if;
  if coalesce(p_draw_no,(select draw_no from public.draws where id=p_draw)) is null
   and (select count(*) from public.prize_structures where denomination=(select denomination from public.draws where id=p_draw))>1
   then raise exception 'Draw number is required to select the prize structure'; end if;
  select count(*) filter(where tier=1) as first,count(*) filter(where tier=2) as second,
   count(*) filter(where tier=3) as third into counts
   from jsonb_to_recordset(p_numbers) as x(number text,tier smallint,provisional boolean);
  if counts.first<>structure.first_count or counts.second<>structure.second_count or counts.third<>structure.third_count
   or exists(select 1 from jsonb_to_recordset(p_numbers) as x(provisional boolean) where provisional)
   then raise exception 'Verified results must contain the complete configured tier counts'; end if;
 end if;

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
 update public.draws set accepted_file_id=p_file,accepted_sha256=p_sha256,status=p_status,parsed_counts=p_counts,
  issues=p_issues,warnings=p_warnings,suspects=p_suspects,draw_no=coalesce(p_draw_no,draw_no),
  held_on=p_held_on,ingested_at=now() where id=p_draw;
 perform public.recompute_matches(p_draw,null);
 if changed and old_file is not null then
  insert into public.pipeline_events(level,kind,draw_id,message)
   values('warning','result_corrected',p_draw,'Published result changed; matches were recomputed.');
 end if;
 update public.heartbeat set last_ingest_ok=now() where id=1;
end $$;
create or replace function public.approve_draw(p_draw uuid,p_numbers jsonb,p_note text,p_sha256 text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare structure record; counts record; file_sha text;
begin
 perform pg_advisory_xact_lock(hashtextextended('bondcheck_matches',0));
 if not public.is_app_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 if length(trim(p_note))<8 then raise exception 'Describe how the official file was verified'; end if;
 perform 1 from public.draws where id=p_draw for update;
 if not found then raise exception 'Draw not found'; end if;
 if jsonb_array_length(p_numbers)<1 or jsonb_array_length(p_numbers)>5000 then raise exception 'Invalid number count'; end if;

 select f.sha256 into file_sha from public.draw_files f join public.draws d on d.accepted_file_id=f.id
  where d.id=p_draw for update of f;
 if p_sha256 is null or file_sha is null or p_sha256<>file_sha then
  raise exception 'Official file version changed or is missing; reload before approval'; end if;
 select p.* into structure from public.prize_structures p join public.draws d on d.denomination=p.denomination
  where d.id=p_draw and p.from_draw_no<=coalesce(d.draw_no,0) order by p.from_draw_no desc limit 1;
 if structure.id is null or structure.third_count is null then raise exception 'Prize structure is not configured'; end if;
 if (select draw_no from public.draws where id=p_draw) is null
  and (select count(*) from public.prize_structures where denomination=(select denomination from public.draws where id=p_draw))>1
  then raise exception 'Draw number is required to select the prize structure'; end if;
 select count(*) filter(where tier=1) as first,count(*) filter(where tier=2) as second,
  count(*) filter(where tier=3) as third into counts
  from jsonb_to_recordset(p_numbers) as x(number text,tier smallint);
 if counts.first<>structure.first_count or counts.second<>structure.second_count or counts.third<>structure.third_count
  then raise exception 'Manual approval requires the complete configured tier counts'; end if;
 delete from public.draw_numbers where draw_id=p_draw;
 insert into public.draw_numbers(draw_id,number,tier,provisional)
 select p_draw,x.number,x.tier,false from jsonb_to_recordset(p_numbers) as x(number text,tier smallint);
 update public.draws set status='ok_manual',decision_note=p_note,ingested_at=now(),
  accepted_sha256=p_sha256,parsed_counts=jsonb_build_object('first',counts.first,'second',counts.second,'third',counts.third),
  approved_file_sha256=(select sha256 from public.draw_files where id=(select accepted_file_id from public.draws where id=p_draw)) where id=p_draw;
 perform public.recompute_matches(p_draw,null);
 insert into public.pipeline_events(level,kind,draw_id,message,data)
 values('warning','manual_approval',p_draw,p_note,jsonb_build_object('actor',auth.uid(),'count',jsonb_array_length(p_numbers)));
end $$;
create or replace function public.mark_win(p_id uuid,p_claim_date date default null,p_received bigint default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_app_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 if p_claim_date is not null and exists(select 1 from public.wins w join public.bonds b on b.id=w.bond_id
  where w.id=p_id and b.owner_id=auth.uid() and w.provisional)
  then raise exception 'Verify a possible win before recording a claim'; end if;
 update public.wins w set acknowledged_at=now(),claim_date=p_claim_date,claim_received=p_received
 from public.bonds b where b.id=w.bond_id and b.owner_id=auth.uid() and w.id=p_id;
 if not found then raise exception 'Win not found'; end if;
end $$;
-- Lock before modifying bonds so ingestion and inserts have one consistent lock order.
create function public.lock_bond_matching() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('bondcheck_matches',0));
 return null;
end $$;
create trigger bonds_match_lock before insert or update or delete on public.bonds
 for each statement execute function public.lock_bond_matching();

-- Match a range once per statement instead of repeating all owner history per row.
drop trigger bonds_rematch on public.bonds;
create function public.bond_batch_rematch() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then
  if not exists(select 1 from new_bonds n join old_bonds o using(id)
   where (n.number,n.denomination,n.deleted_at) is distinct from (o.number,o.denomination,o.deleted_at))
   then return null; end if;
 elsif not exists(select 1 from new_bonds) then return null; end if;
 perform public.recompute_matches(null,null);
 return null;
end $$;
create trigger bonds_insert_rematch after insert on public.bonds
 referencing new table as new_bonds for each statement execute function public.bond_batch_rematch();
create trigger bonds_update_rematch after update on public.bonds
 referencing new table as new_bonds old table as old_bonds for each statement execute function public.bond_batch_rematch();
revoke all on function public.lock_bond_matching(),public.bond_batch_rematch() from public,anon,authenticated;
-- Revalidate affected history after correcting the configuration.
do $$ declare draw record; begin
 for draw in select id from public.draws where denomination=100 and draw_no>=25 and draw_no<51 loop
  perform public.enqueue_job('ingest_draw',jsonb_build_object('draw_id',draw.id));
 end loop;
end $$;
