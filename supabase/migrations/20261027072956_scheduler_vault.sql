create extension if not exists pg_net with schema extensions;
do $$ begin
 if not exists(select 1 from vault.secrets where name='bondcheck_project_url') then
   perform vault.create_secret('https://dwagvpxegvixgztmovyx.supabase.co','bondcheck_project_url','BondCheck target project');
 end if;
 if not exists(select 1 from vault.secrets where name='bondcheck_cron_secret') then
   perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'bondcheck_cron_secret','BondCheck scheduler credential');
 end if;
end $$;
