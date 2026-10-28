begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(40);
select is(public.validate_scheduler_secret(''),false,'An empty scheduler credential is rejected');
select is(public.validate_scheduler_secret(repeat('x',64)),false,'An incorrect scheduler credential is rejected');
select ok(not has_function_privilege('anon','public.validate_scheduler_secret(text)','execute'),'Anonymous clients cannot validate scheduler credentials');
select ok(not has_function_privilege('authenticated','public.validate_scheduler_secret(text)','execute'),'Signed-in clients cannot validate scheduler credentials');
select ok(has_function_privilege('service_role','public.dispatch_worker(integer)','execute'),'Only the server can wake workers');
select ok(not has_function_privilege('authenticated','public.dispatch_worker(integer)','execute'),'An owner cannot invoke the scheduler RPC directly');
select is(public.poll_due('2026-10-01T01:17:00Z'),true,'Daily discovery uses 06:00 Pakistan time');
select is(public.poll_due('2026-10-01T02:17:00Z'),false,'Ordinary days do not poll every hour');
select is(public.poll_due('2026-10-12T03:17:00Z'),true,'Publication window polls every two hours');
select is(public.poll_due('2026-10-12T02:17:00Z'),false,'Alternate hours in the publication window remain quiet');
select is(public.poll_due('2026-10-10T02:17:00Z'),true,'Peak publication days poll hourly');

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000001','owner@bondcheck.test'),
 ('00000000-0000-0000-0000-000000000002','other@bondcheck.test');
insert into public.app_owners(user_id) values('00000000-0000-0000-0000-000000000001');
insert into public.result_admins(user_id) values('00000000-0000-0000-0000-000000000001');
insert into public.draws(id,denomination,draw_date,draw_no,status) values
 ('10000000-0000-0000-0000-000000000001',750,'2000-01-15',81,'ok_manual');
insert into public.draw_numbers(draw_id,number,tier) values
 ('10000000-0000-0000-0000-000000000001','007447',2);
insert into public.bonds(owner_id,denomination,number,series,purchased_on) values
 ('00000000-0000-0000-0000-000000000001',750,'007447','AB','1999-01-15'),
 ('00000000-0000-0000-0000-000000000001',750,'007447','CD','1999-01-15'),
 ('00000000-0000-0000-0000-000000000001',200,'007447','AB','1999-01-15');
select is((select count(*)::integer from public.wins where draw_id='10000000-0000-0000-0000-000000000001'),2,'Historical matches respect purchase dates and denomination while ignoring series');
insert into public.draws(id,denomination,draw_date,draw_no,status) values
 ('10000000-0000-0000-0000-000000000002',750,'2015-01-15',61,'needs_review'),
 ('10000000-0000-0000-0000-000000000003',750,'2016-01-15',65,'needs_review'),
 ('10000000-0000-0000-0000-000000000004',750,'2017-01-15',69,'needs_review');
insert into public.draw_numbers(draw_id,number,tier,provisional)
 select id,'111111',2,true from public.draws where id in('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004');
insert into public.bonds(owner_id,denomination,number,series,purchased_on)
 values('00000000-0000-0000-0000-000000000001',750,'111111','DATE','2016-01-15');
select is((select count(*)::integer from public.wins where draw_id='10000000-0000-0000-0000-000000000002'),0,'A bond bought in 2016 cannot win a 2015 draw');
select is((select count(*)::integer from public.wins where draw_id='10000000-0000-0000-0000-000000000003'),0,'Same-day draws are excluded by the strictly-after rule');
select is((select count(*)::integer from public.wins where draw_id='10000000-0000-0000-0000-000000000004'),1,'A 2017 draw after the 2016 purchase can match');
update public.bonds set purchased_on='2018-01-15' where series='DATE' and owner_id='00000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.wins where draw_id='10000000-0000-0000-0000-000000000004'),0,'Editing the purchase date immediately removes ineligible wins');
delete from public.bonds where series='DATE' and owner_id='00000000-0000-0000-0000-000000000001';
select public.recompute_matches('10000000-0000-0000-0000-000000000001',null);
select public.recompute_matches('10000000-0000-0000-0000-000000000001',null);
select is((select count(*)::integer from public.wins where draw_id='10000000-0000-0000-0000-000000000001'),2,'Repeated matching is idempotent');
select is((select min(prize_amount)::integer from public.wins where draw_id='10000000-0000-0000-0000-000000000001'),500000,'Amounts come from structure configuration');
update public.draws set status='needs_review' where id='10000000-0000-0000-0000-000000000001';
select public.recompute_matches('10000000-0000-0000-0000-000000000001',null);
select is((select count(*)::integer from public.wins where provisional and draw_id='10000000-0000-0000-0000-000000000001'),2,'Unverified draws produce only possible wins');
delete from public.draw_numbers where draw_id='10000000-0000-0000-0000-000000000001';
select public.recompute_matches('10000000-0000-0000-0000-000000000001',null);
select is((select count(*)::integer from public.wins where draw_id='10000000-0000-0000-0000-000000000001'),0,'Corrections remove stale wins');
select public.enqueue_job('ingest_draw','{"draw_id":"10000000-0000-0000-0000-000000000001"}');
select public.enqueue_job('ingest_draw','{"draw_id":"10000000-0000-0000-0000-000000000001"}');
select is((select count(*)::integer from public.ingest_jobs where payload->>'draw_id'='10000000-0000-0000-0000-000000000001'),1,'Duplicate enqueues create one runnable job');
create temporary table claimed as select * from public.claim_jobs(1);
select is((select count(*)::integer from public.claim_jobs(1)),0,'A second worker cannot claim an active leased job');
select public.finish_job((select id from claimed),'00000000-0000-0000-0000-000000000099');
select is((select status from public.ingest_jobs where payload->>'draw_id'='10000000-0000-0000-0000-000000000001' limit 1),'running','A stale lease cannot finish a newer worker job');
select public.finish_job((select id from claimed),(select lease_token from claimed));
select is((select status from public.ingest_jobs where payload->>'draw_id'='10000000-0000-0000-0000-000000000001' limit 1),'done','The correct worker lease can finish the job');

grant select on public.bonds to anon;
set local role anon;
select is((select count(*)::integer from public.bonds),0,'Anonymous callers cannot read bonds');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.bonds),3,'The enrolled owner sees their bonds');
select throws_ok($$insert into public.draws(denomination,draw_date) values(750,'2026-10-15')$$,
 '42501',null,'The app cannot write official draws');
select throws_ok($$select public.recompute_matches(null,null)$$,'42501',null,'Service matching RPC is not exposed to the client');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.bonds),0,'A different authenticated account cannot read bonds');
select is((select count(*)::integer from public.draws),0,'Unenrolled accounts cannot read pipeline data');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.draw_files(id,draw_id,url,kind,sha256) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','https://savings.gov.pk/fixture.txt','txt',repeat('a',64));
update public.draws set accepted_file_id='20000000-0000-0000-0000-000000000001' where id='10000000-0000-0000-0000-000000000001';
create temporary table reviewed_numbers as
 select jsonb_agg(jsonb_build_object('number',number,'tier',tier)) as numbers from(
 select '347425' as number,1 as tier union all select '007447',2 union all select '827353',2 union all select '876615',2
 union all select n::text,3 from generate_series(100000,101695)n) x;
select throws_ok($$select public.approve_draw('10000000-0000-0000-0000-000000000001','[{"number":"007447","tier":2}]','Partial fixture must be rejected',repeat('a',64))$$,
 'P0001','Manual approval requires the complete configured tier counts','Partial manual lists cannot become verified');
select throws_ok($$select public.approve_draw('10000000-0000-0000-0000-000000000001',(select numbers from reviewed_numbers),'Wrong file version must be rejected',repeat('c',64))$$,
 'P0001','Official file version changed or is missing; reload before approval','Manual approval checks the raw file version');
select throws_ok($$select public.replace_draw_result('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
 'ok','[{"number":"007447","tier":2,"provisional":false}]','{}','[]','[]','[]',81,'2000-01-15',repeat('a',64))$$,
 'P0001','Verified results must contain the complete configured tier counts','Automatic verification also rejects incomplete tier counts');
select public.approve_draw('10000000-0000-0000-0000-000000000001',(select numbers from reviewed_numbers),'Verified the complete official fixture manually',repeat('a',64));
select public.replace_draw_result('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
 'needs_review','[]','{}','["source issue"]','[]','[]',81,'2000-01-15',repeat('a',64));
select is((select status from public.draws where id='10000000-0000-0000-0000-000000000001'),'ok_manual','Re-ingesting unchanged bytes does not erase manual approval');
update public.draw_files set sha256=repeat('b',64) where id='20000000-0000-0000-0000-000000000001';
select throws_ok($$select public.replace_draw_result('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
 'needs_review','[]','{}','[]','[]','[]',81,'2000-01-15',repeat('a',64))$$,'P0001',
 'File changed during ingestion; retry the job','A stale file version cannot replace newer data');
select public.replace_draw_result('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
 'needs_review','[{"number":"007447","tier":2,"provisional":true}]','{}','["new source issue"]','[]','[]',81,'2000-01-15',repeat('b',64));
select is((select status from public.draws where id='10000000-0000-0000-0000-000000000001'),'needs_review','Changed bytes require fresh verification');
update public.wins set claim_date='2026-10-27',acknowledged_at=null where draw_id='10000000-0000-0000-0000-000000000001';
select public.acknowledge_win((select id from public.wins where draw_id='10000000-0000-0000-0000-000000000001' limit 1));
select is((select min(claim_date)::text from public.wins where draw_id='10000000-0000-0000-0000-000000000001'),'2026-10-27','Marking a result as seen preserves claim records');
select public.replace_draw_result('10000000-0000-0000-0000-000000000001',null,'failed','[]','{}','["Temporary source outage"]','[]','[]',81);
select is((select count(*)::integer from public.draw_numbers where draw_id='10000000-0000-0000-0000-000000000001'),1,'A download outage retains previously accepted numbers');
select is((select count(*)::integer from public.wins where draw_id='10000000-0000-0000-0000-000000000001' and provisional),2,'Previously found wins stay visible provisionally during an outage');
select public.enqueue_job('ingest_draw','{"draw_id":"10000000-0000-0000-0000-000000000001"}');
create temporary table claimed_again as select * from public.claim_jobs(1);
select public.enqueue_job('ingest_draw','{"draw_id":"10000000-0000-0000-0000-000000000001"}');
select public.finish_job((select id from claimed_again),(select lease_token from claimed_again));
select is((select status from public.ingest_jobs where id=(select id from claimed_again)),'queued','New candidates arriving during a run are processed again');
select * from finish();
rollback;
