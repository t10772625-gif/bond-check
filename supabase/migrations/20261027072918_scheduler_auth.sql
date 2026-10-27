-- Keep the scheduler credential in Vault; never return it to a caller.
-- Edge Functions use their built-in service role to validate the header.
create function public.validate_scheduler_secret(p_secret text) returns boolean
language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select length(coalesce(p_secret,'')) >= 32 and exists(
   select 1 from vault.decrypted_secrets
   where name='bondcheck_cron_secret'
     and extensions.digest(decrypted_secret,'sha256')=extensions.digest(p_secret,'sha256')
 );
$$;
revoke all on function public.validate_scheduler_secret(text) from public,anon,authenticated;
grant execute on function public.validate_scheduler_secret(text) to service_role;

-- This pre-existing platform event trigger is not a client RPC.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
   revoke all on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end $$;
