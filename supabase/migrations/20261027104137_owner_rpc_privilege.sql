-- Supabase default function ACLs may grant anon explicitly as well as PUBLIC.
-- Owner membership is used by authenticated RLS/RPCs, not anonymous callers.
revoke all on function public.is_app_owner() from anon;
