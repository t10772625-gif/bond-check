-- Latest owner instruction: only draws strictly AFTER the entered purchase date.
-- This supersedes the earlier spec that ignored purchase dates. Same-day draws are excluded.
alter table public.bonds alter column purchased_on set not null;
create or replace function public.recompute_matches(p_draw uuid default null,p_bond uuid default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('bondcheck_matches',0));
 delete from public.wins w using public.bonds b where w.bond_id=b.id
 and (p_draw is null or w.draw_id=p_draw) and (p_bond is null or b.id=p_bond)
 and not exists(select 1 from public.draws d join public.draw_numbers n on n.draw_id=d.id
   where d.id=w.draw_id and d.denomination=b.denomination and n.number=b.number
   and d.status in('ok','ok_manual','needs_review') and b.deleted_at is null
   and b.purchased_on is not null and d.draw_date>b.purchased_on);

 insert into public.wins(bond_id,draw_id,tier,prize_amount,provisional)
 select b.id,d.id,n.tier,
   case n.tier when 1 then ps.first_amount when 2 then ps.second_amount else ps.third_amount end,
   n.provisional or d.status='needs_review'
 from public.draws d join public.draw_numbers n on n.draw_id=d.id
 join public.bonds b on b.denomination=d.denomination and b.number=n.number
 left join lateral(select * from public.prize_structures p where p.denomination=d.denomination
   and p.from_draw_no<=coalesce(d.draw_no,0) order by p.from_draw_no desc limit 1) ps on true
 where d.status in('ok','ok_manual','needs_review') and b.deleted_at is null
   and b.purchased_on is not null and d.draw_date>b.purchased_on
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
   and b.purchased_on is not null and d.draw_date>b.purchased_on
 left join public.wins w on w.bond_id=b.id and w.draw_id=d.id
 where (p_draw is null or d.id=p_draw) and (p_bond is null or b.owner_id=(select owner_id from public.bonds where id=p_bond))
 and d.status in('ok','ok_manual','needs_review') group by b.owner_id,d.id;
end $$;
create or replace function public.bond_batch_rematch() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then
  if not exists(select 1 from new_bonds n join old_bonds o using(id)
   where (n.number,n.denomination,n.deleted_at,n.purchased_on) is distinct from (o.number,o.denomination,o.deleted_at,o.purchased_on))
   then return null; end if;
 elsif not exists(select 1 from new_bonds) then return null; end if;
 perform public.recompute_matches(null,null);
 return null;
end $$;
select public.recompute_matches(null,null);
