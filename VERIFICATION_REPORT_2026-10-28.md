# BondCheck verification and repair report — 28 October 2026

## Release status

**Android candidate: 1.8.6, version code 16.** This report distinguishes observed results from incomplete verification. It is not a certification that the application can never fail or that production deployment is complete.

The APK is `BondCheck-v1.8.6.apk` beside `App.tsx` and `README.md`. It includes ARM64 and ARMv7 and requires Android 7 or later. Its SHA-256 is:

`3a1b8d2a208fbfddef1a079c86e2b2a35c393ee63cd51fef94532df50d5c4d54`

The same APK was installed on the connected Infinix X6886. Subsequent repository-only documentation changes do not change that APK. Release builds automatically copy the versioned APK into the repository root.

**Production gates remain open:** public email delivery configuration, completion of actual Gmail-to-app password recovery, deployment of the new server date-conflict guard, resolution of historical result exceptions, and production signing. These are detailed below; they must not be represented as passed.

## What was wrong, where, and what changed

| Area | Cause / impact | Repair and location | Verification |
|---|---|---|---|
| Confirmation opened localhost | Live Auth Site URL was `http://localhost:3000`; signup supplied no explicit destination. | Live Site URL changed to `bondcheck://auth/callback`; signup, resend and recovery specify the callback in `src/cloud/api.ts`; Android and iOS register the URL scheme. | Live invalid-link probe returned a native callback instead of localhost. A fresh account was created through the phone and became confirmed. Successful Gmail-to-app confirmation navigation itself was not completely observed. |
| Confirmed users received owner-access 403 | Creating an Auth user did not enroll the verified identity into the application access table. | Applied migration `20261028050651_onboarding_receipts_bulk.sql` enrolls verified accounts. Result-administration permissions are separate from ordinary account access. | Fresh QA account logged in on the phone and read shared results without 403. Standard-account Check now succeeded on the phone. |
| Confusing Auth user records | An Auth row was being treated as proof of email verification. | Confirmation is checked separately through `email_confirmed_at`; application enrollment requires confirmation. | Real QA registration, confirmation timestamp and later password login were observed. An unverified Auth row alone is not verification. |
| Manually extracted Gmail link returned 400 | The copied inner URL still contained `%3D` and `%26`, so `type=signup` was not a separate query parameter. | The app uses the complete email link and a registered callback. It does not manually strip Gmail's wrapper. Invalid/used links receive an actionable message. | Callback validation and expired-link rejection are covered by API tests. The already-used token was not presented as a fresh successful test. |
| Signup notice disappeared / forms reset during requests | Busy state replaced the whole authentication screen. | `App.tsx` keeps the auth form mounted while requests run; `CloudAuthScreen.tsx` retains confirmation state and notices. | Phone registration and auth-screen rendering tests. |
| Forgot password was not real recovery | The previous cloud UI only instructed the user to contact an owner. | Recovery email, callback/code verification and password update are implemented. Recovery state survives token refresh and is persisted with the session. | A real QA reset email request succeeded through the phone. Successful delivery, latest-link opening, password change and old-password rejection remain unverified end to end. |
| Repeated auth taps | Busy rendering alone leaves a small interval for repeated submissions. | Immediate request guards in `CloudAuthScreen.tsx`, plus a disabled submit state. | Repeated signup presses in the regression test issue one signup request. |
| Login/signup spacing and eye controls | Adjacent buttons lacked spacing; input/button sizing differed; password icons were unsuitable. | Shared 52-point normal control minimums, 12-point button separation, consistent borders and accessible eye/slash controls in `ui.tsx`, `theme.ts` and `AuthScreen.tsx`. | Both screens inspected on the phone. Show/hide controls exercised with empty passwords, without exposing QA credentials. |
| White import/input screen | CSV and JSON restore used default white native modal backgrounds with dark-theme text. | Both now use the themed `FullModal`, safe insets, keyboard-aware Back handling and visible validation messages. | White screen reproduced and captured before repair. Dark CSV and JSON restore screens inspected after repair. Invalid dates were rejected. |
| Red errors from unrelated local data in Settings | Legacy migration preview included another/demo workspace. | Migration choices are restricted to the signed-in identity's eligible local workspaces and are collapsed until requested. | Fresh QA Settings inspected without unrelated migration errors. Genuine unresolved-result warnings remain visible. |
| Redundant Home badge / large greeting | Cloud Home retained legacy workspace presentation. | Removed the cloud “My bonds” header badge and reduced greeting size in `HomeScreen.tsx`. | Physically inspected on the phone. |
| New holdings stayed on Add | Successful save did not open the listing. | Single, preview, CSV and restore save paths open All bonds; listing sorts by descending identity. | A 1,501-bond range, CSV import and JSON restore opened the listing automatically, newest records first. |
| Duplicate holdings on retries | UI guards alone cannot provide database uniqueness. | Database uniqueness is `(owner_id, denomination, series, number)`; cloud mutations have immediate guards. Conflict errors explain existing/trash records. | Six simultaneous identical live inserts produced one success, five `409/23505` rejections and exactly one row. Replaying the committed request also rejected a duplicate. The exact temporary row was removed. Six rapid phone taps on CSV Save added only the intended two rows. |
| Save followed by stale data | A poll started before a write could satisfy the post-save refresh. | `reload(true)` waits for an older read and fetches committed state; obsolete flight/account results cannot replace the current snapshot. | Code and regression checks; real post-save listing navigation and fresh counts observed. |
| Account-switch races | A request waiting for refresh could continue using a different signed-in identity. | `SupabaseApi.request()` binds a request to its starting owner; mutation callbacks check owner identity. Logout clears private cloud caches. | Regression test proves a queued write is not sent under another account after refresh. Live QA access could not read client holdings. |
| Pagination truncated larger portfolios | A single API page could not establish that all holdings were loaded. | Stable keyset pagination uses descending `local_id` for holdings and ascending `id` for shared records, with progress and duplication guards. | Real 1,501-row phone portfolio, oldest-record search and full Select all count; independent 1,501-row API regression test. |
| No selection / Select all delete | Listing lacked bulk actions. | Search-aware and denomination-aware selection plus atomic owner-scoped `trash_bonds` RPC. | Selected and moved all 1,501 QA holdings to trash through the phone; listing became zero. Mixed-owner rejection was also checked in a rolled-back live database test. |
| Claim receipts lost on rematching | Derived win rows were also the only storage for claim history. | Private `win_records` persist receipt/claim/acknowledgement independently; matching restores them. | Live database checks plus actual phone save of a QA receipt, delete, restore and visible recovery of the same receipt. |
| Invalid receipt data | Negative amounts and impossible claim dates were not adequately guarded. | UI and database validate nonnegative safe whole amounts and draw-to-today claim dates. Possible wins cannot be claimed as verified. | Negative QA receipt did not save; a valid QA receipt did save. Live database checks rejected negative and pre-draw claims. |
| Claimed holdings labelled “Renewed” | Cloud screens reused a local-workspace status label. | Cloud labels now say “Claimed”; cloud details omit empty “Added by”. Claim save returns to bond details. | Claimed status and the saved receipt observed on the phone. |
| Range purchase date was difficult to find / calendar navigation slow | Date input appeared in an unsuitable order and the calendar required month-by-month navigation. | Explicit shared range/paste purchase date, typed ISO or DD/MM/YYYY dates, selectable year grid and month grid. | Phone year → month → day selection set 14 Sep 2020. A typed DD/MM/YYYY date was normalized and used for the 1,501-row range. |
| Missing published Rs100 list | Compact dates such as `170826` were not discovered correctly. | Discovery recognizes validated compact dates and surfaces result-looking links it cannot date instead of silently skipping them. | Rs100 draw #55, 17 Aug 2026, was recovered on the backend and then found through phone search. |
| Result-admin permissions exposed to normal accounts | Portfolio access and global source-management authority shared a gate. | Separate `result_admins`, server-side checks and hidden admin controls for normal accounts. | Fresh QA identity was not a result administrator; forbidden global approval and mixed-owner operations were rejected in live DB tests. |
| Date-conflicting results counted as verified money | Six stored listing dates differ from their official file's held-on date. | Client immediately treats these as possible results, excludes their prize amounts from verified totals and adjusts coverage. Parser rejects date conflicts. Prepared database guard quarantines automatic conflicts. | Client regression and automation tests pass; phone coverage changed from 165 to 159 verified out of 178. **New database guard and updated parser deployment are still pending**, because MCP authentication failed. |
| CSV/backup validation and hidden partial loss | Invalid rows could be left behind when successful navigation closed the preview; archive state was lost. | Save is blocked until invalid rows are fixed; archive state is preserved; duplicate headers and import-size limits are checked. | Invalid phone CSV and JSON dates rejected; valid active and archived rows restored/imported and shown at the top. |
| Exports mixed possible and verified amounts | Legacy export logic included assumptions and inconsistent counts. | Verified totals exclude possible wins. Cloud exports use gross prizes and entered receipts; CSV preserves separate series and six-digit number fields and can be imported again. | Source/regression checks; native PDF and Excel export dialogs opened on the phone. External sending was cancelled. Full spreadsheet/PDF content validation was not performed on the phone. |
| Fingerprint existed only in local mode | Cloud sessions bypassed the old local biometric flow. | Owner-bound system biometric guard, native prompt, background/cold-start lock, password fallback and safe handling of unavailable/invalidated biometric keys. No account password is stored for cloud fingerprint unlock. | Real native fingerprint prompt and successful unlock observed; a bounded cold-start cancellation test kept the portfolio hidden and offered password login. Unavailable hardware and invalidated-key fallback have regression tests. |
| Animation/timer cleanup | Splash animations and pending persistence timers survived unmount. | Animations and persistence timers now stop on cleanup. | Final serial Jest run passed without the earlier worker shutdown warning; splash open-handle check passed. |

## Phone verification record

Testing used a separate QA account. The client account was not used for the later testing. The one earlier temporary client holding, its associated claim/history records and its generated check records were removed; client holdings were verified as zero before backend MCP access expired.

Observed on the physical Infinix:

- Real new-account registration, confirmed account state and successful password login.
- Home header, account separation, shared result availability and Settings.
- Auth spacing and eye controls; reset-email request and waiting screen.
- Year, month and day selection; manually typed dates.
- A 1,501-row range save, automatic listing, newest-first ordering and search for the oldest row beyond the first page.
- Select all and atomic trash of all 1,501 rows.
- Restore, claim save, claim-preserving delete/restore and edited holder/note while retaining number/series.
- Archive action, claimed Win History, normal-account Check now and official draw search.
- CSV invalid-date rejection, valid active/archive import and six rapid Save taps.
- JSON invalid-date rejection and valid active/archive restore.
- Native PDF/Excel share dialogs and cancellation.
- Native fingerprint success and a cold-start cancellation that did not expose portfolio data.

Physical testing was interrupted when ADB reported no connected device, and the phone was subsequently reconnected. Field-fill attempts that failed the automation driver's value checks are not counted as successful app tests. Fresh-account Single/Paste completion, full recovery-link completion, light-theme review, and remaining export/cleanup actions must not be inferred from the completed range/import tests.

## Automated and backend checks

| Check | Result |
|---|---|
| TypeScript typecheck | Passed |
| Final serial Jest run | **8 suites, 25 tests passed** |
| Automation/parser coordination tests | **20 passed** |
| ESLint over `App.tsx` and `src` with errors-only output | Passed; existing warnings are not claimed eliminated |
| Earlier live database suite after onboarding migration | 40 checks passed |
| Additional live isolation/receipt/atomic-delete transaction, rolled back | 12 checks passed |
| Live concurrent duplicate/replay probe | One stored holding; all duplicate attempts rejected; exact fixture cleaned up |
| Android ARM64 + ARMv7 release build | Passed |
| Root APK vs build APK SHA-256 | Identical |

Limits are explicit: 1,000-row read pages; 2,000 numbers per range; 10,000 pasted/imported/restored rows per operation; 1 MB CSV/restore text; 10,000 IDs per atomic bulk delete. These bounds do not establish unlimited-load performance. Cached/private data is scoped by account, and genuine server failures remain visible rather than being presented as successful checks.

## Backend deployment state

Already applied/deployed during this session:

- Verified-account enrollment, separate result-administrator permissions, claim-history persistence, claim validation and atomic bulk trash migration.
- Worker/discovery/auth-status/administration fixes deployed to the seven existing automation Edge Functions.
- Native callback configured as the live Auth Site URL.
- Previously missed compact-date Rs100 source recovered and ingested.

Not yet applied/deployed:

- `supabase/migrations/20261028073500_draw_date_consistency.sql`.
- The final held-on/listed-date validation addition in `supabase/functions/_shared/core.mjs`.

Supabase MCP began returning `OAuth token refresh failed: Failed to parse server response`. Browser fallback navigation was attempted, but a reliable live SQL-editor execution path was not established. No unexecuted migration is described as deployed.

## Outstanding production requirements

1. **Email delivery:** the project was using Supabase's default sender. That service is restricted to authorized team addresses and low email volume. General public signup/recovery requires configured custom SMTP or a supported send-email hook. No provider credentials were available in the app workspace; confirmation must not be disabled to hide this issue. See the [official SMTP requirements](https://supabase.com/docs/guides/auth/auth-smtp).
2. **Actual recovery completion:** a reset email request succeeded, but a fresh Gmail link followed by successful password change, old-password rejection and new-password login was not observed end to end. Callback validation and persistence tests do not substitute for that delivery test.
3. **Server date guard:** apply the prepared migration and deploy the updated parser, then rerun the live DB checks. The client guard is active in this APK, but this does not upgrade old installed clients or change server state.
4. **Official-result exceptions:** the backend has 178 known draws, including 13 existing unresolved documents/count exceptions and six additional date conflicts. This APK shows 159 verified, with the remainder excluded from verified totals. Older history outside the stored corpus is not certified complete. These exceptions must be reconciled against official records instead of guessed or approved merely to make the status green.
5. **Signing:** the current APK retains the existing debug signing certificate to preserve upgrade compatibility on the phone. Production distribution needs the owner's release signing configuration and a deliberate migration plan. No customer app data was erased to change certificates.
6. **Backup scope:** the restore tool restores holdings and archive status. Claim receipts in exports remain reference records and are not automatically replayed. This limitation is explicitly shown in the restore screen.
7. **Remaining device coverage:** no iOS build or second physical Android device was tested. Network-loss behavior and all phone/OS combinations are not certified by these results.

## Evidence and handling

Phone screenshots, QA fixtures and raw checks are kept in ignored `.verification/`; passwords, sessions and confirmation/reset tokens are excluded from the report and Git. Test data is isolated from client data. The earlier `docs/AUTH_AND_APPLICATION_AUDIT_2026-10-28.md` is a historical pre-fix audit, not the current release status.

The delivered branch contains the implemented fixes, regression checks, prepared server migration, this report and the current APK. Open production requirements above remain explicit release gates.
