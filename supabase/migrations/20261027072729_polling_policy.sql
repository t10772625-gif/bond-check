create function public.poll_due(p_at timestamptz default now()) returns boolean
language sql immutable set search_path=public,pg_temp as $$
 select extract(hour from(p_at at time zone 'Asia/Karachi'))=6
 or extract(day from(p_at at time zone 'Asia/Karachi')) in(10,11,15,16,17)
 or (extract(day from(p_at at time zone 'Asia/Karachi')) between 9 and 22
     and mod(extract(hour from(p_at at time zone 'Asia/Karachi'))::integer,2)=0);
$$;
revoke all on function public.poll_due(timestamptz) from public,anon,authenticated;
