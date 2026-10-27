# BondCheck setup and operations

## Current state

The target project has 15 deployed migrations, eight Edge Functions and four pg_cron jobs. The remote 40-assertion suite passed, including purchase-date eligibility. All 177 discovered official draws have been processed: the recorded snapshot is 164 verified and 13 needing OCR/review, with 245,393 number rows and no queued/failed jobs. The official TLS chain is securely repaired on the server. See `DEEP_DETAILED_AUDIT.md` for the complete current flow and limitations.

Target: `dwagvpxegvixgztmovyx` only. Existing global MCP definitions originally pointed to another project and were not used.

## Local app

1. Use Node 22.13.0 (`nvm use 22.13.0`); `.nvmrc` records the version.
2. Copy `.env.example` to `.env`. Supply `SUPABASE_PUBLISHABLE_KEY` from the project's Connect dialog. Keep the URL unchanged.
3. `npm ci`, then `npm run configure`. The generator includes only the project URL and public key, and rejects a service-role/secret key. There is no unavailable Supabase SDK dependency; the typed transport uses Supabase's HTTPS Auth/Data APIs.
4. `npm run typecheck`, `npm test -- --runInBand`, `npm run test:parser`, `npm run test:automation`, `npm run lint`.
5. `npm run android` (Android SDK/JDK required). iOS requires macOS, Xcode and CocoaPods. Native file pickers are included for both platforms but require a native build, not only a Metro reload.

Without a public key the app retains local mode and explicitly labels automatic checking as disconnected. With a public key it uses Supabase login, server-authoritative bonds/wins, the draw status board and owner-scoped APIs. Cloud credentials are stored in the OS keychain, separately from the legacy prototype's local accounts.

## Connect Codex MCP

In a normal terminal run `powershell -ExecutionPolicy Bypass -File scripts/setup-mcp.ps1`. It registers the latest requested project-scoped **write-enabled** URL and starts OAuth login. Open a new Codex session after authenticating so the tools can be exposed. The later write-enabled instruction superseded the initially supplied read-only URL.

The refreshed session successfully exposes the authenticated, project-scoped Supabase tools. The earlier registration failures are resolved for this session. Verify `get_project_url` before any writes; do not use a server definition scoped to another project.

Official references: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Supabase MCP](https://supabase.com/docs/guides/ai-tools/mcp).

## Phase 0: measure before choosing the fetcher

1. Install/authenticate the Supabase CLI in a terminal with network access.
2. Link the target project: `supabase link --project-ref dwagvpxegvixgztmovyx`.
3. The migrations generate a random scheduler credential in Vault (`bondcheck_cron_secret`). Edge Functions validate it using a service-role-only RPC. An optional `CRON_SECRET` environment override must match Vault. Never include either credential in the mobile bundle.
4. Deploy `connectivity-spike`: `supabase functions deploy connectivity-spike --project-ref dwagvpxegvixgztmovyx`.
5. POST JSON `{ "urls": [listUrl, txtUrl, pdfUrl] }` with `x-cron-secret`. Use actual URLs from `automation/sources.txt` and the known Rs750 list page. Repeat over a day; record the evidence in `PHASE0_REPORT.md`.

Server probes now pass after supplying the missing, cryptographically verified GoGetSSL CA 2 intermediate. Certificate/hostname validation remains enabled. Normal discovery and matching run on the server while the app is closed. Native foreground fetching is a fallback; the platform fetcher still rejects the site's broken chain on the tested Infinix, so healthy server discovery takes priority. Scans/ambiguous source files remain explicit exceptions, not unattended verified success.

## Database and auth deployment

1. Inspect the target project's existing schema and migrations using an authenticated connection.
2. Start Docker for local testing. Run `supabase start`, `supabase db reset`, then `supabase test db`. The pgTAP suite verifies historical matching, denomination/series rules, corrections, idempotency and RLS.
3. Apply the reviewed migrations with `supabase db push` to the linked project. Do not apply the schema to another project.
4. Create the owner's email/password account in Supabase Auth; disable public signups. The migration auto-enrolls an owner only when exactly one Auth user already exists. Otherwise enroll the intended account explicitly:

   ```sql
   insert into public.app_owners(user_id)
   select id from auth.users where email = 'OWNER_EMAIL';
   ```

5. Deploy all functions: `supabase functions deploy --project-ref dwagvpxegvixgztmovyx`. Supabase supplies built-in server URL/service-role credentials. Handlers validate the Vault scheduler secret or actual user JWT plus owner membership even though gateway `verify_jwt` is disabled.
6. Sign in from the app and verify a real bond insert against an ingested historical winner. Repeat with an unenrolled user: private rows must remain inaccessible. Never bundle the service-role key.

The latest owner instruction supersedes the original date-ignoring specification. SQL matches number + denomination, ignores series, and requires draw_date > purchased_on. Purchase date is mandatory; earlier and same-day draws are excluded. Same-number bonds in different series can win separately when eligible. Unresolved matches remain provisional. Unknown structures and incomplete tier counts cannot become verified, even through manual approval.

## Existing local data

Settings → Upload old data → choose a workspace → review counts/invalid rows/duplicates → create/export backup → upload the valid rows. The backup is retained locally and in a private bucket before insertion. `legacy_id` makes re-running safe; existing data is not deleted or silently padded. Legacy 7500/15000 rows and numbers with lost digits remain invalid and visible. Local passwords are not uploaded.

CSV imports require `number,denomination,purchased_on`, with optional `series,holder,note`. Invalid rows stay visible. A range is capped at 2,000 numbers. Unknown purchase dates in old backups must be corrected before upload; originals remain in the backup.

## Discovery, backfill and documents

- Sources are discovered from the official download index. Only the verified Rs750 list URL is seeded; other slugs are not guessed. A missing/ambiguous list source keeps completeness false.
- Run check queues discovery and reconciliation. Full backfill queues unresolved historical draws. The database queue, retries and lease tokens survive closing the app.
- Raw bytes and SHA-256 versions live in the private `draw-raw` bucket. A global database slot spaces server requests by at least one second; redirects stay on the official HTTPS domains and downloads are capped at 5 MB/20 seconds.
- PDF/Word candidates are retained. Edge Functions automatically extract PDF text and DOCX text with resource limits. Scan-only PDFs remain needs_ocr. The external converter remains available for legacy DOC/XLS/XLSX and heavier files; its CI activation has not been verified. Never mark an OCR/numeric-cell guess certain merely to clear the status board.
- Review requires comparing the complete list with the official file, explicitly confirming it and recording a note. All approvals and corrections are logged. Provisional wins are never included in verified-win totals.
- `npm run check:corpus` checks all 42 supplied URLs. It requires network access; PDFs/documents are explicitly listed for conversion. Investigate every unexpected review before release. The supplied file list did not contain the separate premium test mentioned in the spec; additional premium tests were written and clearly identified.

## Scheduling and pause recovery

1. Scheduler Vault secrets are provisioned by the migrations. Keep their values private; if an Edge CRON_SECRET override is set, keep it synchronized with Vault.
2. Scheduling is included in the migration history. `supabase/schedules.sql` can idempotently refresh the named jobs. Cron uses UTC and polling decisions use Asia/Karachi. A five-minute worker schedule recovers queued jobs, and bounded chains process up to eight further invocations without waiting for the next cron. Heartbeat/watchdog run daily.
3. Add GitHub repository secrets `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`; enable `.github/workflows/pipeline.yml` in your own repository. It sends a real heartbeat and checks discovery independently of in-database cron, and runs document conversion. Workflow failures must reach the owner. GitHub scheduling is not guaranteed, and public-repository scheduled workflows may disable after inactivity; monitor the workflow and free usage allowance.
4. Verify the workflow actually ran and timestamps advanced. Merely adding YAML does not activate scheduling on this machine or on GitHub.
5. If paused/unreachable: restore the project in the Supabase dashboard, run discovery, retry failed jobs and run full backfill/reconcile. Check that every known draw has a status and pending jobs drain. No in-database scheduler can restore a paused database.
6. Before release perform the ten-day outage/catch-up drill and compare random historical draws/bonds against official sources. Record actual observations; these live checks have not been performed in this restricted session.

Supabase references: [Auth for React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native), [scheduled functions and Vault](https://supabase.com/docs/guides/functions/schedule-functions), [Cron](https://supabase.com/docs/guides/cron).
