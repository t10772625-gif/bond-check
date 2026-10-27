-- Prevent partial approvals and preserve possible wins during source outages.
alter table public.draws add column accepted_sha256 text;
update public.draws d set accepted_sha256=f.sha256 from public.draw_files f where f.id=d.accepted_file_id;
create or replace function public.replace_draw_result(
 p_draw uuid,p_file uuid,p_status text,p_numbers jsonb,p_counts jsonb,p_issues jsonb,
 p_warnings jsonb,p_suspects jsonb,p_draw_no integer default null,p_held_on date default null,p_sha256 text default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare old_file uuid; changed boolean; structure record; counts record;
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
drop function public.approve_draw(uuid,jsonb,text);
create function public.approve_draw(p_draw uuid,p_numbers jsonb,p_note text,p_sha256 text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare structure record; counts record; file_sha text;
begin
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
revoke all on function public.approve_draw(uuid,jsonb,text,text) from public,anon;
grant execute on function public.approve_draw(uuid,jsonb,text,text) to authenticated;
create policy draw_raw_owner_read on storage.objects for select to authenticated
 using(bucket_id='draw-raw' and public.is_app_owner());
