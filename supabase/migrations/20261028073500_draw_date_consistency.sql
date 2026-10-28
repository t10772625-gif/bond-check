-- A publication/listing date and the file's held-on date can disagree.
-- Keep the evidence and possibilities; neither date is silently treated as verified.
create or replace function public.guard_draw_result_date()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare reason text;
begin
  if new.held_on is not null and new.held_on <> new.draw_date
     and new.status in ('ok','ok_manual') then
    if new.status='ok_manual' then
      raise exception 'Resolve the draw-date conflict before approving this result';
    end if;
    reason := format('Draw date differs: listed %s, file %s; verify the official date before counting this result',new.draw_date,new.held_on);
    new.status := 'needs_review';
    if not (coalesce(new.issues,'[]'::jsonb) @> jsonb_build_array(reason)) then
      new.issues := coalesce(new.issues,'[]'::jsonb) || jsonb_build_array(reason);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_draw_result_date() from public,anon,authenticated;
create trigger guard_draw_result_date before insert or update of status,held_on,draw_date
on public.draws for each row execute function public.guard_draw_result_date();

do $$
declare affected record;
begin
  for affected in select id from public.draws
    where held_on is not null and held_on<>draw_date and status='ok'
  loop
    update public.draws set status='ok' where id=affected.id;
    perform public.recompute_matches(affected.id,null);
  end loop;
end $$;
