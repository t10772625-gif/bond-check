create function public.acknowledge_win(p_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_app_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 update public.wins w set acknowledged_at=now() from public.bonds b
 where b.id=w.bond_id and b.owner_id=auth.uid() and w.id=p_id;
 if not found then raise exception 'Win not found'; end if;
end $$;
revoke all on function public.acknowledge_win(uuid) from public,anon;
grant execute on function public.acknowledge_win(uuid) to authenticated;
