alter table public.draw_files add column device_fetched_at timestamptz;
alter table public.draw_files add column device_fetch_attempts integer not null default 0;
alter table public.draw_files add column device_retry_at timestamptz;
