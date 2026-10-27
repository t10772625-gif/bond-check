alter table public.draw_files add column converted_sha256 text;
create table public.fetch_clock(id integer primary key check(id=1),next_at timestamptz not null default now());
insert into public.fetch_clock(id) values(1);
alter table public.fetch_clock enable row level security;
create function public.reserve_fetch_slot() returns integer language plpgsql security definer
set search_path=public,pg_temp as $$
declare slot timestamptz;
begin
 update public.fetch_clock set next_at=greatest(next_at,clock_timestamp())+interval '1 second'
 where id=1 returning next_at-interval '1 second' into slot;
 return greatest(0,ceil(extract(epoch from(slot-clock_timestamp()))*1000))::integer;
end $$;
revoke all on function public.reserve_fetch_slot() from public,anon,authenticated;
grant execute on function public.reserve_fetch_slot() to service_role;
grant all on public.fetch_clock to service_role;
