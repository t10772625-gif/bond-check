# BondCheck: authentication and application audit — 28 October 2026

> Historical pre-fix audit. See [the current verification report](../VERIFICATION_REPORT_2026-10-28.md) for repairs, observed tests and outstanding production requirements.

**Original audit result: the installed app had confirmed onboarding failures and additional data-integrity defects. Passing the existing tests did not establish that a new person could register, verify their email and use the app.**

Roman Urdu: aap ke dono reported maslay valid hain. Signup mein usable verification destination/callback nahi diya gaya. Email confirm ho jane ke baad bhi naya account `app_owners` mein enroll nahi hota, is liye app ka backend usay 403 deta hai. Neeche har finding ke saath jagah, wajah, asar aur verification likhi hai.

This is an **audit and issue list**, not a claim that these issues have been fixed. Application code, live Auth settings, owner enrollment and the installed APK were not changed during this audit. Database test fixtures ran inside rolled-back transactions; a subsequent query confirmed no audit fixture accounts remained.

## Scope and evidence

| Item | Audited state |
|---|---|
| Date/time | 2026-10-28; live observations approximately 04:33–04:49 UTC / 09:33–09:49 Pakistan time, with report preparation afterward |
| Branch | `feat/official-results-automation-2026-10-27` |
| Source commit | `d9d91c62c17a4e7b785a725636b552c981644be2` |
| Supabase project | `dwagvpxegvixgztmovyx`, confirmed using the connected Supabase tool |
| Physical phone | Infinix X6886, connected over ADB |
| Installed application | `com.bondcheck`, version **1.7.1**, version code **9**; last update 2026-10-27 16:46:03 |
| Current physical result | Login screen visibly contains **`Supabase 403: Owner access required`**, plus Retry connection / Sign out |
| Coverage | Root routing; cloud and legacy authentication; session/cache handling; portfolio CRUD; dates/series/ranges; CSV; backup/restore; claims; Results; discovery/parser/worker; SQL privileges/RLS; schedules; Android/iOS link configuration; CI and release configuration |

Evidence labels used below:

- **LIVE:** read from this Supabase project or the connected phone during this audit.
- **REPRODUCED:** an isolated diagnostic test exercised the current implementation and demonstrated the behavior.
- **CODE:** a source/configuration finding with the relevant execution path inspected; not represented as a completed physical end-to-end scenario.
- **GAP:** an unavailable feature or missing verification, separated from a proven runtime defect.

P0 means the requested first-use journey is blocked. P1 means significant correctness, data loss or release-readiness risk. P2 means a functional, recovery or operational defect requiring follow-up. These are application priorities, not formal security vulnerability scores.

## Why the two reported errors happen

1. `SupabaseApi.signUp()` sends `POST /auth/v1/signup` with email, password and name. It supplies **no `redirect_to`**.
2. There is no app confirmation route, verification page, OTP verification method or registered BondCheck mobile URL scheme.
3. Supabase uses its configured default Site URL when a supported explicit redirect is absent. The reported `localhost:3000` destination is consistent with Supabase's development default. **The actual live Site URL and email template could not be read with the available public key/tools; their exact values remain to be inspected.**
4. A standard Supabase confirmation link can verify the email **before** redirecting. A broken localhost page therefore does not prove that confirmation failed.
5. The live database contains **two Auth users, both email-confirmed; only one is in `app_owners`**. One confirmed account is consequently denied application access.
6. Login obtains an Auth session, then `SupabaseRepo.snapshot()` calls `pipeline_status()`. That RPC rejects unenrolled identities. Edge `heartbeat` independently enforces the same membership requirement.
7. Live logs contained **six 403 responses for `/functions/v1/heartbeat`** in the queried default last-24-hours window. The phone currently shows the same owner-access error. Those counts are observations, not a claim that every 403 in the project was a genuine user failure; earlier audit/security probes also exist in the logs.

Supabase's official explanation of default redirects: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls). Its confirmation-link and verification-button options: [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

## Finding index

| ID | Priority | Finding | Evidence |
|---|---|---|---|
| F01 | P0 | Verification has no usable application destination/callback | CODE + reported localhost behavior |
| F02 | P0 | A confirmed signup cannot become an authorized app account | LIVE + SQL reproduction |
| F03 | P1 | Global busy routing unmounts auth forms and loses signup confirmation | App integration reproduction |
| F04 | P1 | Forgot password does not send a recovery email | CODE |
| F05 | P2 | No resend-confirmation or expired-link recovery flow | CODE |
| F06 | P2 | Authorization denial leaves a saved session and repeated failing requests | LIVE + CODE |
| F07 | P2 | Local/deployment onboarding configuration disagrees with live signup | LIVE + CODE |
| F08 | P1 | Published Rs100 August 2026 draw is silently skipped | Official page + LIVE + reproduction |
| F09 | P1 | Conflicting result metadata can still be automatically verified | LIVE + reproduction |
| F10 | P1 | Manually supplied result text can become automatically verified | Pipeline reproduction |
| F11 | P1 | A device-fetched file can remain permanently pinned to old bytes | Pipeline reproduction; conditional activation |
| F12 | P1 | Moving a bond to trash and restoring it loses claim/payment history | Live rollback reproduction |
| F13 | P2 | Negative receipts and claim dates before the draw are accepted | Live rollback reproduction |
| F14 | P2 | Empty actual-received input silently records zero as a claim | CODE |
| F15 | P1 | Backup restore does not restore claims or full holding state | CODE |
| F16 | P2 | Trashed bonds still block re-add/import through uniqueness | Live rollback reproduction |
| F17 | P2 | Edit screen invites an empty purchase date that cloud rejects | CODE |
| F18 | P2 | Zero-row database updates are treated as successful edits | Repository reproduction |
| F19 | P2 | Add/import drafts are shared across accounts and survive logout | CODE |
| F20 | P2 | A terminal refresh-token rejection leaves invalid session state | API reproduction |
| F21 | P2 | Backend drops HTTP error status, so an auth 401 becomes Edge 500 | Database-wrapper reproduction + CODE |
| F22 | P2 | Fresh server snapshots wait behind slow native source downloads | CODE |
| F23 | P2 | Snapshot polling continues while the app is backgrounded | CODE |
| F24 | P2 | Cloud routing removes the existing CSV/Excel/PDF export entry point | CODE |
| F25 | P1 | Release tests miss the real signup/verification/onboarding journey | Test-source inspection + reproduced escaped defects |
| F26 | P1 | Android release configuration uses the public debug signing key | CODE |
| F27 | P2 | Leaked-password protection is disabled | LIVE advisor |

## Authentication and first use

### F01 — No working verification destination or callback

**Where:** `src/cloud/api.ts:70`; `android/app/src/main/AndroidManifest.xml:20`; `ios/BondCheck/Info.plist`; `src/cloud/CloudScreens.tsx:64`.

**Why:** the raw signup URL has no `redirect_to`. Android registers only its launcher intent. iOS has generic Linking forwarding in `SceneDelegate`, but no BondCheck URL scheme in Info.plist. JavaScript contains no confirmation-link consumer or `/verify`/OTP implementation. No hosted confirmation page exists in this repository.

**Impact:** email verification has no usable completion destination under app control. Changing the signup success text cannot repair this.

**Verified:** a transport diagnostic captured the exact signup URL/body. Native files and JavaScript were inspected. The localhost URL itself is the user's observation; the private live Auth configuration was not available to independently read.

**Required outcome:** configure an actual supported HTTPS verification destination, or a registered mobile callback, in both Auth and the client. A verification-button page must perform real token verification and show success, expired/invalid link and resend states. Re-test by opening an actual fresh email on a phone away from the development computer. Do not use localhost, a success-only static page or automatic public administrative enrollment as a substitute.

### F02 — Verified signup is not sufficient to use the application

**Where:** `src/cloud/api.ts:82`; `src/data/SupabaseRepo.ts:79`; `supabase/functions/_shared/runtime.ts:49`; `supabase/migrations/20261027072710_automation.sql` functions `is_app_owner()` / `pipeline_status()` and owner RLS policies.

**Why:** registration creates an Auth identity but never enrolls it in `app_owners`. The app offers signup while its portfolio and every owner Edge endpoint require separate enrollment. The database restriction is functioning as coded; the user onboarding journey is incomplete.

**Impact:** correct credentials and a confirmed email still end at `Owner access required`. This is authorization after authentication, not necessarily a bad password or failed email verification.

**Verified:** live totals are 2 confirmed Auth identities / 1 enrolled owner / 1 confirmed unenrolled identity. A rollback test reproduced SQLSTATE `42501` with message `Owner access required` for an unenrolled identity. The actual phone shows the error; deployed heartbeat v3 contains the owner gate.

**Required outcome:** provide a supported enrollment/invitation journey for the intended account and a clear pending-access state. If registration is meant to be self-service, separate normal portfolio users from global result administrators before enabling it. Simply removing RLS or making every signup an administrator would create a different correctness/security problem.

### F03 — Busy state destroys the current auth screen

**Where:** `App.tsx:202`, `App.tsx:218`; `src/cloud/useAutomation.ts:151`, `src/cloud/useAutomation.ts:175`; `src/cloud/CloudScreens.tsx:99`.

**Why:** setting `automation.busy` makes Root replace `CloudLoginScreen` with `LoadingScreen`. React unmounts the form. When signup completes, `setNotice(...)` runs on the old form instance; the newly mounted form starts with an empty notice and empty fields.

**Impact:** even a successful registration can return to a blank login form without the email instructions. Login errors also discard typed credentials. Check/backfill actions unmount MainApp and reset screen-local search/filter/modal state for the same reason.

**Verified:** a diagnostic rendered the real `<App />` with cloud enabled, deferred the signup HTTP response, observed the form disappear while busy, completed signup, then observed a new form with no confirmation notice and empty fields. Network was mocked; this did not send a real email.

**Fix direction:** keep the active screen mounted; use a local disabled/loading state or overlay, and hold auth-flow state at a level that survives navigation.

### F04 — Forgot password is a message, not recovery

**Where:** `src/cloud/CloudScreens.tsx:76`; `src/cloud/api.ts`.

**Why:** pressing Forgot password displays instructions to contact the account owner. No recovery-email request, recovery callback or password-update API exists in the cloud flow.

**Impact:** a person who forgets their cloud password cannot recover access through the app. The earlier local password-reset functions cannot change a Supabase password.

**Fix direction:** implement the actual email recovery and new-password journey, using the same valid redirect/callback configuration as F01. Test expired and already-used recovery links as well as success.

### F05 — No confirmation resend or invalid-link recovery

**Where:** `src/cloud/CloudScreens.tsx:64`; `src/cloud/api.ts:70`.

**Why:** signup offers a notice but no resend endpoint/control, OTP entry or invalid/expired-token screen.

**Impact:** a missing, expired or previously consumed email leaves the user repeating signup/login without a supported recovery path. A new verification page alone will not complete this requirement.

**Fix direction:** add resend with throttling and explicit success/error states; preserve the submitted email across the flow. Test a fresh email separately from attempts to register an already existing email.

### F06 — Access denied is handled like a temporary connection failure

**Where:** `src/cloud/api.ts:64`; `src/cloud/useAutomation.ts:88`, `src/cloud/useAutomation.ts:138`, `src/cloud/useAutomation.ts:151`; `src/cloud/CloudScreens.tsx:185`.

**Why:** Auth session persistence occurs before portfolio authorization is checked. `signIn()` catches the snapshot failure but keeps the session. Polling starts for any session, including an unenrolled user. The UI offers Retry connection without explaining or resolving enrollment.

**Impact:** closing/reopening the app restores the same blocked identity, and retries continue producing authorization errors. The user sees infrastructure text instead of a useful account state.

**Verified:** phone state and heartbeat 403s support the execution path. Keeping an Auth identity for an enrollment screen can be valid, but this app has no such screen/workflow.

**Fix direction:** distinguish unauthenticated, unverified, awaiting access, authorized and temporary network failure states. Stop owner-only polling until authorization succeeds.

### F07 — Local Auth configuration and live onboarding differ

**Where:** `supabase/config.toml:16`; `docs/RUNBOOK.md:42`; live `GET /auth/v1/settings`.

**Why:** the repository disables signup and the runbook describes privately created owners. Live Auth reports `disable_signup: false`, email auth enabled and `mailer_autoconfirm: false`. The installed UI exposes Create account.

**Impact:** local/CI behavior cannot represent the live registration journey. Neither an entirely private invitation flow nor a complete self-service flow has been implemented consistently.

**Verified:** the public live settings request returned HTTP 200. No management key was available to read Site URL, redirect allowlist, SMTP settings or email templates; those remain separate configuration checks.

## Result discovery and verification integrity

### F08 — A currently published Rs100 draw is completely missing

**Where:** `supabase/functions/_shared/core.mjs:47`, especially date extraction at line 56; `supabase/functions/_shared/discovery.mjs:4`.

**Why:** discovery accepts only labels containing a separated `DD-MM-YYYY` or `DD/MM/YYYY` date. The official Rs100 page has a link labelled **`100_170826_Txt`**, pointing to `https://savings.gov.pk/wp-content/uploads/2026/08/100_170826.txt`. The parser silently returns no candidate for it. A successfully downloaded source page can therefore still miss a published result.

**Impact:** Rs100 holdings cannot be checked against the 17 August 2026 draw. It is absent even from the unresolved-draw count, so resolving the existing 13 exceptions would still leave this missing draw.

**Verified:** the [official Rs100 page](https://savings.gov.pk/rs-100-prize-bond-draw/) exposes that link; a local reproduction returns `[]` for its anchor; live SQL returns **0 draw rows and 0 file rows** for this result. The latest stored Rs100 draw is 15 May 2026. Fetching the linked result body during this audit timed out, so its winning numbers were not independently revalidated.

**Fix direction:** handle compact filename/label dates with validated denomination/year context, and surface unparsed result-looking links. Add an expected-draw inventory or explicit coverage reconciliation so silently skipped candidates cannot disappear from completeness reporting.

### F09 — Conflicting file/list metadata can remain “verified”

**Where:** `supabase/functions/_shared/prizebond-parser.mjs:119`, `:126`; `supabase/functions/_shared/core.mjs:214`; `supabase/migrations/20261027101646_purchase_date_eligibility.sql:24`.

**Why:** conflicting denomination and held-date metadata become warnings. Complete number counts can still produce `status: 'ok'`. Matching uses `draw_date`, not `held_on`.

**Impact:** when the authoritative date is unresolved, purchase-date eligibility around the disputed dates is unresolved too. Equal tier counts do not establish which date or denomination is correct.

**Verified:** diagnostic fixtures with a different file date or an Rs1500 header attached to an Rs750 draw both return `ok`. Live SQL also found these six `ok` draws with different dates:

| Denomination | Draw | Stored draw date | File held date |
|---|---:|---|---|
| 100 | 36 | 2021-11-18 | 2021-11-15 |
| 200 | 84 | 2020-12-16 | 2020-12-15 |
| 200 | 87 | 2021-09-16 | 2021-09-15 |
| 200 | 90 | 2022-06-16 | 2022-06-15 |
| 1500 | 83 | 2020-08-15 | 2020-08-17 |
| 40000 | 29 | 2024-06-11 | 2024-06-10 |

This proves inconsistency, **not that all six stored dates are wrong**. Official files can contain typos. Each discrepancy needs an authoritative decision and recorded evidence; blindly trusting the opposite field is not a fix.

### F10 — Owner-uploaded bytes can become “automatically verified”

**Where:** `supabase/functions/upload-draw-file/index.ts`; `supabase/functions/_shared/pipeline.mjs:137`, `:192`, `:231`; `supabase/functions/_shared/core.mjs:4`.

**Why:** uploaded text is stored as `manual://...`, parsed, and evaluated using the same count rules as a server-fetched official source. `manual` has the same selection rank as TXT. There is no mandatory provenance check or explicit manual-approval step before an otherwise complete uploaded list becomes `ok`.

**Impact:** accidentally altered or fabricated complete text can be presented as verified and affect matching. The existence of the separate `approve_draw` RPC does not protect a path that can bypass it. Currently only enrolled owners can upload; this finding is not an anonymous-upload exploit.

**Verified:** a diagnostic supplied a complete synthetic Rs750 list through `Pipeline.candidate()` as a manual file and obtained `status: 'ok'` without approval. No such file was uploaded to production.

**Fix direction:** separate origin authenticity, parsing completeness and human approval. Uploaded bytes should remain provisional until independently matched to official bytes or explicitly reviewed with actor/hash evidence.

### F11 — Old device-fetched results can bypass future server refreshes

**Where:** `supabase/functions/_shared/pipeline.mjs:137`; `supabase/functions/device-sync/index.ts` file upload/update branch.

**Why:** any truthy `device_fetched_at` selects stored bytes unconditionally. It has no age check and is not cleared after server connectivity recovers.

**Impact:** a same-URL official correction can be missed indefinitely by the server for a device-fetched candidate. Device fallback is normally skipped while server discovery is healthy, so it cannot be relied on to refresh the pinned bytes.

**Verified:** a diagnostic used `device_fetched_at` from 2020, provided a network fetch implementation, and observed **zero network fetches**, one stored download and a verified result. The current heartbeat's `last_device_sync` is null; a production correction missed by this condition was not established.

**Fix direction:** treat device bytes as a bounded fallback. Revalidate official URLs after a freshness interval or successful server recovery, preserving hashes and version history.

## Portfolio, claims, imports and restore

### F12 — Trash/restore loses payment history

**Where:** `src/store/AppStore.tsx:708`; `src/data/SupabaseRepo.ts` `remove()`; `supabase/migrations/20261027101646_purchase_date_eligibility.sql:8`, `:26`.

**Why:** soft-deleting a bond triggers matching. `recompute_matches()` deletes wins for deleted/ineligible holdings. Claims and received amounts live on those win rows. Restoring the bond creates replacement win rows with null claim and acknowledgment fields.

**Impact:** a reversible-looking “move to trash” destroys previously recorded claim/payment details. A restored paid prize appears unclaimed again. Changing eligibility or the number and later reverting it can cause the same class of loss.

**Verified:** rollback fixture: record Rs400,000 received → move bond to trash → win count becomes zero → restore → matching win returns with `claim_date`, `claim_received`, `acknowledged_at` all null. Real holdings were not deleted or edited.

**Fix direction:** keep financial records in a durable ledger independent of derived matches. Soft deletion should preserve history; corrected/ineligible matches should retain an auditable association rather than erase receipts.

### F13 — Invalid receipt amounts/dates are accepted

**Where:** `supabase/migrations/20261027093547_matching_batch_and_rs100.sql:146`; `src/sheets/Sheets.tsx:172`.

**Why:** `mark_win()` checks owner identity and provisional status but does not validate received amount or its relation to claim date/draw date. The table has no compensating checks for these fields.

**Impact:** negative received money and a claim date before the draw are stored as normal claim records, corrupting received/pending summaries.

**Verified:** live rolled-back calls stored `claim_received = -100` and a claim date earlier than the fixture draw. The live function definition was inspected, not just an old migration.

**Fix direction:** validate nonnegative actual receipts and supported date rules in SQL as well as UI. Define whether a missing amount is unknown or a genuine zero; do not silently conflate them. Do not impose a gross-prize cap without defining how the product should handle adjustments.

### F14 — Empty receipt input becomes a zero-value completed claim

**Where:** `src/sheets/Sheets.tsx:195`; `src/store/AppStore.tsx:649`.

**Why:** Save claim converts input with `+rcv || 0`, while cloud mode initializes it to an empty string. Claim date defaults to today.

**Impact:** tapping Save without entering actual money records the prize as claimed with zero received, removing it from pending totals. Nonnumeric input also falls back to zero.

**Fix direction:** require a valid explicit receipt amount, or deliberately model “claim started / amount unknown” separately from received payment.

### F15 — Backup restore is not a full state recovery

**Where:** `src/cloud/CloudScreens.tsx:921`; `src/cloud/BackupRestore.tsx:20`; `scripts/backup-bonds.mjs`.

**Why:** Export cloud backup includes a snapshot with wins/claims, but Restore bonds maps only number, denomination, date, series, holder and note. It does not restore claim receipts, acknowledgments, archive state or trash. Existing holdings are skipped as duplicates. The weekly server backup script selects bond rows only, omitting the wins/payment records as well.

**Impact:** an exported backup cannot recover the payment history lost in F12. An archived holding restored as new defaults to active. The button is explicitly named “Restore bonds,” so this is a recovery capability gap rather than proof that the UI promises a complete database restore.

**Fix direction:** define/version the supported backup contract; include durable receipts and archive state; implement authorized restore/merge semantics and validate a complete export → clean fixture → restore round trip.

### F16 — Recently deleted holdings still block additions

**Where:** `supabase/migrations/20261027072710_automation.sql:58`; `src/cloud/BackupRestore.tsx`; `src/cloud/csv.ts`; `src/store/AppStore.tsx:782`.

**Why:** `unique(owner_id,denomination,series,number)` covers soft-deleted rows too. Add/import previews compare active/archive bonds rather than trash, and therefore can classify a number as new before INSERT fails.

**Impact:** the user deletes a holding, tries to re-add/import it and receives a raw uniqueness failure; a range/CSV containing that row can fail its whole atomic insert.

**Verified:** rollback test confirms a soft-deleted holding still produces SQLSTATE `23505` on re-add.

**Fix direction:** detect trashed duplicates and offer Restore, or deliberately change uniqueness/holding-lifecycle design. Preserve the atomic batch guarantee while making previews consistent with the database.

### F17 — Edit purchase-date guidance contradicts cloud validation

**Where:** `src/sheets/Sheets.tsx:253`; `src/components/ui.tsx:404`; `src/cloud/migration.ts` `normalizeBond()`; purchase-date migration line 3.

**Why:** Edit says “empty if unknown” and exposes Clear, while cloud normalization rejects an empty purchase date and SQL requires it.

**Impact:** following the screen's instructions causes an unavoidable save error. The required-date rule is correct for the current requested matching policy; the edit form is inconsistent with it.

**Fix direction:** make cloud Add/Edit guidance and controls agree with the rule. Missing historical dates should have an explicit unresolved/import state if supported, not a misleading empty-date instruction.

### F18 — Edits do not check that a row was actually updated

**Where:** `src/data/SupabaseRepo.ts:108`, especially the PATCH with `Prefer: return=representation`.

**Why:** the repository requests the updated representation but ignores its length/content. PostgREST can return a successful response with `[]` when the row no longer exists or is not visible to the caller.

**Impact:** a stale device or authorization change can produce a “Changes saved”/“restored” message even though zero rows changed.

**Verified:** a mocked successful empty PATCH response causes `update()` to resolve without error.

**Fix direction:** require exactly one returned row for single-row updates and surface missing/conflicting data explicitly.

### F19 — Draft data is not isolated by account

**Where:** `src/store/AppStore.tsx:19`, `:162`, `:211`, `:238`.

**Why:** Add/staged/import state uses the single `bondcheck.draft` key. The cloud logout path clears session/sheets but not the form, staged list or persisted draft. Drafts are loaded before knowing the owner.

**Impact:** when different accounts use the same installation, the next account can see the previous person's unfinished numbers, holder/note and purchase date, and can accidentally save them to their own portfolio. This does not bypass server RLS.

**Verified:** source/data-flow inspection; no real account switching was performed on the phone.

**Fix direction:** use owner-scoped draft keys, clear/switch the in-memory draft on identity change, and define treatment of pre-login legacy drafts.

## Session, refresh and interface behavior

### F20 — Terminal refresh rejection does not clear invalid credentials

**Where:** `src/cloud/api.ts:85`; `src/cloud/useAutomation.ts:105`.

**Why:** refresh errors propagate but do not distinguish a revoked/not-found refresh token from a temporary network error. Startup has already installed the saved session and possibly loaded its cached snapshot.

**Impact:** a revoked session can remain installed, show saved data with repeated errors and keep retrying until the user manually signs out. Local cache availability and current authorization are not represented as separate states.

**Verified:** an API diagnostic returns HTTP 400 / invalid refresh token and confirms `api.session` remains the old invalid object.

**Fix direction:** clear/re-authenticate on terminal credential errors while preserving intentional offline-cache behavior for temporary outages. Do not indiscriminately log users out for every network failure.

### F21 — Auth HTTP 401 is converted to Edge HTTP 500

**Where:** `supabase/functions/_shared/db.mjs:26`; `supabase/functions/_shared/runtime.ts:49`, `:81`; `src/cloud/api.ts:121`.

**Why:** `Database.request()` throws a plain Error containing status only in its text. `serve()` uses `failure.status ?? 500`. An expired/invalid `/auth/v1/user` response consequently becomes an Edge 500. The mobile API retries authentication only on actual HTTP 401.

**Impact:** token expiry/revocation between local checks and the server request can appear as a server fault, bypassing the client's refresh-on-401 path.

**Verified:** a diagnostic feeds the database wrapper a 401 and confirms the thrown error has no `status`; the handler/client branches were traced. A live expired-token Edge request was not sent.

**Fix direction:** preserve upstream status/code and normalize auth failures to supported client states. Keep real backend faults distinguishable from invalid credentials and owner denial.

### F22 — Slow official fallback delays fresh portfolio data

**Where:** `src/cloud/useAutomation.ts:80`; `src/cloud/refresh.ts`; `src/cloud/deviceSync.ts`.

**Why:** `refreshAfterSync()` awaits the entire native sync before calling server reload. Native sync sequentially fetches source pages and up to eight files, with additional network requests and waits.

**Impact:** when fallback is needed and the official site is slow, new stored wins, claims and corrections can remain stale for the duration of the source downloads. The previous fix ensures reload runs after a failure, but still waits for that failure/work to finish first.

**Fix direction:** refresh the authoritative portfolio immediately; run bounded source fallback separately and refresh again on completion. Preserve identity guards and avoid overlapping device jobs.

### F23 — Polling does not pause with the app lifecycle

**Where:** `src/cloud/useAutomation.ts:138`; `src/data/SupabaseRepo.ts:79`.

**Why:** the 30-second interval is installed for any session. Only `deviceSync()` checks whether AppState is active. `reload()` still fetches the full bond/win snapshot, draws, files and status while JavaScript is allowed to run in the background.

**Impact:** unnecessary network/cache writes and battery use; for unenrolled accounts it also repeats denied requests. Mobile operating systems can suspend timers, so this is not a claim that polling runs continuously after suspension.

**Fix direction:** suspend foreground polling when inactive, refresh immediately on foreground, and use change-aware/server-delta fetching if portfolio size grows.

### F24 — Cloud mode removes the existing statement export entry point

**Where:** `App.tsx` cloud Settings routing; `src/screens/SettingsScreen.tsx:836`; `src/sheets/Sheets.tsx:422`; `src/cloud/CloudScreens.tsx:880`.

**Why:** CSV/Excel/PDF statement actions remain in ExportSheet, opened by the original SettingsScreen. Cloud mode routes to CloudSettingsScreen, which exposes a JSON backup but no entry point to that sheet.

**Impact:** the original statement export capability is inaccessible through the current cloud navigation. This is separate from the JSON backup feature.

**Fix direction:** restore the required cloud export entry point, then adapt its existing calculations/format to cloud semantics. Existing legacy exports still include fixed estimated-tax fields and bond-level provisional win counts; they should not simply be re-enabled without review. This audit does not treat currently unreachable legacy export calculations as a live cloud accounting defect.

## Verification and release controls

### F25 — Existing tests exercise a narrower flow than the release requires

**Where:** `__tests__/App.test.tsx:8`; `__tests__/cloud-login.test.tsx:6`; `__tests__/supabase-api.test.ts`; `.github/workflows/verify.yml`; `docs/VERIFICATION_LOG.md`.

**Why:** the App smoke test sets the cloud publishable key to an empty string, selecting local mode. Login/signup UI tests mock `useApp`, `signIn`, `signUp` and a permanently false busy state. They assert callback arguments and text, not a real email, callback, enrollment or working portfolio. API tests previously covered refresh concurrency/logout races rather than signup verification. The database suite intentionally verifies that an unenrolled account cannot read data; that passing security check does not prove onboarding provisions the intended account.

**Impact:** all previous checks can pass while F01/F02/F03 remain in the shipped APK. Prior physical testing used a prepared enrolled dummy account, so it bypassed the failing new-user boundary.

**Required release check:** fresh account → actual delivered email → tap on a phone outside the development machine → observable confirmed state → supported enrollment/access → login → add holding → match/read back → logout/relaunch. Include failed login, resend, expired link, password recovery, terminal refresh, cache/account isolation and claim-preserving trash/restore. A release build and empty crash log do not substitute for these journeys.

### F26 — Release APK is configured with debug signing

**Where:** `android/app/build.gradle:89`, `:101`, `:104`; tracked `android/app/debug.keystore`.

**Why:** release uses `signingConfigs.debug` and the standard development keystore settings. No separate production signing configuration exists in that build file.

**Impact:** this is unsuitable as the final signing identity for distributed production releases. A build named “release” is not sufficient evidence of release readiness.

**Verified:** source configuration and the installed version were inspected. The APK certificate was not independently extracted during this audit; no signing key was generated or replaced.

**Fix direction:** plan production signing and key backup before distribution; assess update compatibility with existing installed builds. Keep this work separate from the auth root causes.

### F27 — Leaked-password protection is disabled

**Where:** live Supabase Auth configuration as reported by the Security Advisor.

**Why/impact:** known-compromised passwords are not being rejected through that feature. The signup UI's six-character rule is not a substitute for a defined server password policy.

**Verified:** live advisor returned `auth_leaked_password_protection` WARN. Availability/plan requirements and the full server password policy were not checked through the management API.

**Fix direction:** review and enable the supported password policy/protection. [Supabase remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Additional operational and coverage gaps

These are not counted as separate new root causes in F01–F27.

### G01 — Thirteen discovered draws remain unresolved

Live state remained **177 discovered / 164 verified / 13 unresolved**, with 245,393 stored number rows. An empty queue did not resolve these documents. This is in addition to the completely missing Rs100 draw in F08.

| Denomination | Draw | Date | State / stored reason |
|---|---:|---|---|
| 100 | unknown | 2019-08-15 | needs_ocr / PDF conversion |
| 100 | unknown | 2020-08-15 | needs_ocr / PDF conversion |
| 100 | unknown | 2021-08-15 | needs_review / third-prize structure cannot be selected without draw number |
| 200 | 79 | 2019-09-16 | needs_review / third count 2398 vs 2394; duplicate 000000 |
| 200 | 89 | 2022-03-15 | needs_review / third count 2398 vs 2394; duplicate 000000 |
| 750 | unknown | 2024-01-15 | incomplete / DOC conversion |
| 750 | 100 | 2024-10-15 | needs_review / missing first and second tiers |
| 750 | 108 | 2026-10-15 | needs_review / missing second-tier number; suspicious `7447` |
| 1500 | unknown | 2026-08-17 | needs_ocr / PDF conversion |
| 25000 | unknown | 2023-12-11 | needs_ocr / PDF conversion |
| 40000 | 8 | 2019-03-11 | needs_review / third count 1144 vs 660; repeated 000000 |
| 40000 | 15 | 2020-12-10 | needs_review / missing first-tier number |
| 40000 | unknown | 2023-12-12 | needs_ocr / PDF conversion |

`documents.ts` supports PDF text/DOCX, not scan OCR or DOC/XLS conversion. `scripts/document-worker.mjs` is the external conversion path; its repository workflow/service operation was not established as live in this audit. Stored “needs_ocr” is not proof that running OCR alone would validate every PDF; investigate each raw file.

### G02 — “Full historical backfill” only retries known unresolved draws

**Where:** `src/cloud/CloudScreens.tsx:908`; `supabase/functions/_shared/pipeline.mjs:344`.

Backfill selects already stored draws whose status is not `ok`/`ok_manual`. Discovery scans configured current pages. Neither path establishes an inventory of every historical draw or reconstructs history missing from those pages.

| Denomination | Earliest stored | Latest stored | Verified / stored |
|---|---|---|---:|
| 100 | 2019-02-15 | 2026-05-15 | 27 / 30 |
| 200 | 2019-03-15 | 2026-09-15 | 29 / 31 |
| 750 | 2019-01-15 | 2026-10-15 | 29 / 32 |
| 1500 | 2019-02-15 | 2026-08-17 | 30 / 31 |
| 25000 | 2021-03-10 | 2026-09-10 | 22 / 23 |
| 40000 | 2019-03-11 | 2026-09-10 | 27 / 30 |

A holding acquired in 2016 is not comprehensively checked merely because date filtering works: pre-2019 results are absent. The counts also do not prove there are no gaps within the displayed years. The UI carefully says “known/discovered” in places, but the backfill button still overstates what its implementation does.

### G03 — No objects in the private backup bucket at inspection

Live storage contained 185 `draw-raw` objects and **zero `bond-backups` objects**. The four database cron jobs cover discover, worker, heartbeat and watchdog, not backups. Backup automation exists in `.github/workflows/pipeline.yml` / `scripts/backup-bonds.mjs`, but active GitHub execution was not verified; the previous handoff explicitly records an unsuccessful push.

This establishes that this private bucket had no recovery copies at the snapshot, not that the machine/owner has no exported files or that managed Supabase database backups do not exist. The latter were not inspected.

### G04 — Delivery/platform/scale checks still have limits

- No real email was sent/consumed during this audit; SMTP delivery, the precise live confirmation template, Site URL, redirect allowlist and email-scan behavior remain unverified.
- The connected phone was inspected in its existing blocked login state. Existing user credentials/data were preserved; every post-login UI screen was not physically exercised with that account.
- iOS link configuration was reviewed, but iOS build/runtime verification needs macOS/Xcode and was not run.
- No new APK was built/installed because this was an audit without production-code changes. Existing installed version was checked directly.
- Live source requests showed intermittent timeouts. Latest recorded successful discovery at the initial operational snapshot was 2026-10-28 01:17:26 UTC; ingestion 01:25:06 UTC. These timestamps are observations, not proof of uninterrupted future fetching.
- No Android push-notification integration is implemented; server matching while the app is closed does not imply a phone notification will arrive.
- Local Node was `v23.3.0`, outside this package's declared engine ranges and `.nvmrc`/CI Node 22 baseline. It emitted npm experimental warnings; the completed checks still exited successfully. Normalize the toolchain before relying on reproducible release builds.

## Advisor observations that should not be mislabelled

- **RLS enabled without policies** on `app_owners`, `fetch_clock`, `ingest_jobs`, `pipeline_events` is intentional client denial, not evidence that private tables are publicly readable. Do not “fix” it by adding broad allow policies. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Seven authenticated SECURITY DEFINER RPC advisories require review against their internal owner checks. Their existence alone is not proof of an access bypass. Existing privilege tests passed. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Performance Advisor reported **six foreign keys without covering indexes**: `draw_checks.draw_id`, `draw_checks.file_id`, `draw_files.draw_id`, `draws.accepted_file_id`, `pipeline_events.draw_id`, `wins.draw_id`. It also reported per-row Auth evaluation in three RLS policies (`bonds_owner`, `wins_read`, `checks_read`). These are measured configuration observations, not a reproduced latency incident at the current nine-bond portfolio. [Foreign-key guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [RLS guidance](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).
- Full ESLint returned **0 errors / 404 warnings**. This is not a clean lint audit, but the warnings have not all been promoted to independent functional findings.

## What was actually tested this time

| Check | Result | What it establishes |
|---|---|---|
| `npm run typecheck` | PASS, exit 0 | Current project TypeScript checks |
| `npm test -- --runInBand` | PASS, 6 suites / 14 tests | Existing unit/component coverage; limitations in F25 still apply |
| `npm run lint` | Exit 0, 0 errors / 404 warnings | Lint status, not product correctness |
| `npm run test:automation` | PASS, 19 tests | Existing parser/pipeline safety fixtures |
| `npm run test:parser` | PASS, bearer and both premium scripts | Existing parser fixtures, not every official file |
| `python automation/test-document-converter.py` | PASS, 3 tests | Existing conversion fixtures |
| Existing live pgTAP suite | PASS, 40/40; rolled back | Matching dates, RLS, leases, counts, approvals and correction/outage fixtures |
| Additional integrity diagnostics | PASS, 6/6 reproductions; rolled back | Demonstrated owner denial, invalid receipt acceptance and trash/restore data loss |
| Additional client diagnostics | 5 cases; final result recorded in local evidence log | Real-root signup state loss; missing redirect; zero-row PATCH; invalid refresh persistence; conditional account-switch invariant |
| Additional pipeline/wrapper diagnostics | PASS, 6/6 reproductions | Skipped compact-date link, metadata mismatch acceptance, manual auto-verification, pinned device bytes and lost HTTP status |
| Phone inspection | Confirmed version 1.7.1/code 9 and visible owner-access 403 | Actual installed app state |
| Fixture-cleanup/date query | 0 remaining audit accounts; 0 date-ineligible live wins | Test fixture rollback and current purchase-date integrity check |

**A passing diagnostic here means the bug was successfully reproduced. It does not mean the bug was fixed.** The additional tests intentionally document current broken behavior and are retained under ignored `.verification/`, outside the normal release suite. The ordinary Jest list was checked separately and still contains only the original six suites.

One additional conditional finding deserves explicit limits: directly calling the authentication hook for account B while account A's snapshot is installed leaves A's snapshot in memory if B's reload fails. The diagnostic demonstrates that the hook does not enforce a snapshot-owner invariant. Normal UI logout clears the snapshot first; this audit did **not** establish a cross-account data leak through the current phone UI. Treat it as an account-switch robustness requirement rather than a proven RLS bypass.

Initial audit harness attempts needed corrections to temporary-table grants, pgTAP initialization, fixture query scoping and test timing before the successful database/reproduction runs. Those harness errors were not counted as application failures. The original test files were not edited.

### Evidence retained locally

Private/local diagnostic artifacts are intentionally ignored by Git. No passwords, session tokens, service-role keys or confirmation tokens belong in this report.

- `.verification/audit-2026-10-28-phone-ui.xml`
- `.verification/audit-2026-10-28-auth-config.json` — sanitized public Auth settings
- `.verification/audit-2026-10-28-jest.log`
- `.verification/audit-2026-10-28-typecheck.log`
- `.verification/audit-2026-10-28-lint.log`
- `.verification/audit-2026-10-28-automation.log`
- `.verification/audit-2026-10-28-parser.log`
- `.verification/audit-2026-10-28-document.log`
- `.verification/audit-findings.probe.tsx` and `.verification/audit-2026-10-28-reproductions.log`
- `.verification/audit-pipeline-2026-10-28.test.mjs` and `.verification/audit-2026-10-28-pipeline-reproductions.log`
- `.verification/audit-integrity-2026-10-28.sql`
- `.verification/audit-2026-10-28-live-evidence.json` — sanitized live SQL/advisor evidence and rolled-back SQL test results

To rerun the additional local diagnostics:

```powershell
node node_modules/jest/bin/jest.js --runInBand --testMatch '**/.verification/audit-findings.probe.tsx'
node --test .verification/audit-pipeline-2026-10-28.test.mjs
```

The integrity SQL must run as the authorized database test role with its surrounding `BEGIN`/`ROLLBACK` preserved. Do not execute isolated fixture statements as production migrations.

## Repair order and acceptance criteria

1. **Make onboarding coherent:** define the intended account access model, configure the real verification destination, implement callback/button verification, supported enrollment, resend and recovery. Preserve RLS and separate shared-result administration from ordinary portfolio access. The same fresh account must complete the entire phone journey.
2. **Fix root/session state handling:** keep forms mounted during requests, distinguish account states, clear terminal sessions correctly, preserve HTTP statuses and enforce snapshot/draft account isolation. Verify failure/relaunch cases, not only successful dummy login.
3. **Protect financial history:** decouple receipts from derived match rows, validate money/dates and verify claim-preserving trash/restore plus full backup recovery.
4. **Repair coverage and provenance:** discover the missing Rs100 August draw, review all six date discrepancies, resolve the 13 existing exceptions, require a defensible source/approval trail and revalidate device-fetched files. Establish a historical inventory before claiming historical completeness.
5. **Finish operational release checks:** actual backup/restore execution, relevant cloud exports, foreground refresh behavior, production signing and platform-specific verification. Add release-gating journey tests that would fail for the defects above.

An account that logs in and an empty queue are insufficient acceptance criteria. The deliverable should be a demonstrated fresh-user journey and preserved, accurately matched holdings/payment records, with unresolved coverage stated visibly.
