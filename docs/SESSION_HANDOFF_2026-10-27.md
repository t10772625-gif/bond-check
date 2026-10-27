# BondCheck: complete session handoff — 27 October 2026

> **Read this first in a new session.** This document records what was implemented, deployed, tested, installed, committed, and what still needs work. A passing test is not a guarantee of complete historical coverage. Do not tell the owner that checking is 100% complete.

## 1. Exact continuation request for the next session

The owner can paste this:

```text
Read docs/SESSION_HANDOFF_2026-10-27.md completely, then read the detailed audit
and verification log it links. Continue from the existing branch and commits.
Inspect Supabase project dwagvpxegvixgztmovyx only. Recheck the current source,
queue and phone state before changing anything. Finish the documented remaining
work and missing verification. Do not replace the restored original design, do
not ignore purchase-date eligibility, and do not claim 100% coverage while any
official draw is unresolved or historical coverage is missing.

The owner explicitly requested a new branch, meaningful commits and a push.
The first HTTPS push failed with GitHub HTTP 403. Keep the existing local Git
email and do not change Credential Manager: the owner explicitly prohibited it.
Use authorized existing access if available; do not invent a successful push.
```

The primary remaining functional objective is reliable official-result coverage, including resolving the 13 source exceptions and establishing older history. The owner wants to enter his father's holdings once and receive accurate eligible matches, without having to visit National Savings repeatedly.

## 2. Workspace, project, branch and delivery identity

| Item | Value |
|---|---|
| Workspace | `C:\Users\lenovo\Downloads\BondCheck` |
| Shell / machine | Windows PowerShell |
| Owner timezone | Asia/Karachi, UTC+05:00 |
| Target Supabase | `dwagvpxegvixgztmovyx` |
| Target URL | `https://dwagvpxegvixgztmovyx.supabase.co` |
| Repository | `https://github.com/t10772625-gif/bond-check.git` |
| Starting branch | `ui-complete`, tracking `origin/ui-complete` |
| Starting commit | `a8c0e16` — `UI complete - BondCheck frontend` |
| New branch | `feat/official-results-automation-2026-10-27` |
| Implementation commit | `63464773aa3572c4e1c861be6422e592c96e048d` |
| Implementation subject | `feat: automate official draw checking and restore portfolio UI` |
| Implementation scope | 104 files; 9,953 insertions and 320 deletions |
| Handoff commit | The subsequent documentation commit containing this file; identify it with `git log -2 --oneline` |
| Latest installed app | Android **1.7.1 / version code 9** |

There was no merge, force push, reset, uninstall, app-data clear, or change to the original `ui-complete` branch. Development continued on the new feature branch. The implementation commit includes the existing changes from today's work, rather than silently discarding or splitting off the owner's work.

### Push status and the owner's explicit constraint

The implementation push command was:

```powershell
git push --set-upstream origin feat/official-results-automation-2026-10-27
```

It **failed**. GitHub returned:

```text
Permission to t10772625-gif/bond-check.git denied to testuserirenictech.
The requested URL returned error: 403
```

The repository's local `user.email` is correctly set to `t10772625@gmail.com`, matching the email on the existing `ui-complete` commit. The owner explained that he set this email in the morning and explicitly said **do not change Credential Manager**.

Only read-only Credential Manager inspection was performed. It listed the saved GitHub account `testuserirenictech`. No login, logout, credential replacement, account deletion, or Credential Manager reconfiguration was performed. GitHub CLI `gh` is not installed.

Existing SSH was also tested without modifying global configuration or `known_hosts`. GitHub's public SSH host keys were obtained over verified HTTPS from `https://api.github.com/meta` and stored only in ignored `.verification/github-known-hosts`. Authentication then failed with `Permission denied (publickey)`. No private key was printed, generated, uploaded or changed, and the repository remote URL was not changed.

**Commit author email does not grant GitHub repository write permission.** Until an already authorized authentication method is available, or the existing authenticated account receives repository Write permission, pushing remains unfinished. Do not report this branch as uploaded based only on a local commit.

## 3. Which instructions supersede earlier documents?

1. Preserve and restore the original branded splash, login/signup, loading, Home, Results, navigation and searchable bond lists.
2. Cloud matching must respect acquisition date: a bond bought in 2016 must not count a 2015 draw as the owner's win.
3. Current rule is **draw_date > purchased_on**. Earlier and same-day draws are excluded. Purchase date is required.
4. Series letters are optional, but retained for identifying holdings. Winning comparison uses denomination plus exactly six digits.
5. Range entry, leading zeros, View all and search must remain available.
6. The latest request deliberately asks for a dummy account and dummy holdings on the physical phone. Retain them for inspection unless the owner later asks to remove them.
7. Do not change Credential Manager. Local Git email is already correct.

The original automation specification and `APP_AUDIT.md` contain a historical proposal to match all history without a purchase-date filter. That proposal is superseded. Do not reintroduce it because an older paragraph says so. The specification now has a current-policy addendum, and the baseline audit is labelled historical.

## 4. Honest answer: can the owner just add bonds and press Run check now?

**For available, correctly verified draws: yes, the implemented flow checks saved eligible holdings automatically. For every draw in all history with 100% certainty: no, that has not been achieved.**

What happens when a holding is saved:

1. The app validates supported denomination, exactly six digits, optional letters and a valid purchase date.
2. Cloud holdings are persisted to the signed-in owner's Supabase rows under RLS.
3. Normal database bond triggers match that holding against eligible stored results. There is no need to manually open each draw or call the National Savings website for each number.
4. Matched wins return with the owner's portfolio snapshot. Verified and provisional matches remain distinct.

What **Run check now** actually does:

1. The signed-in app invokes authenticated Edge Function `check-now` with action `check`.
2. The handler queues `discover` and calls owner-protected `request_pipeline`, which queues `reconcile`.
3. It starts bounded background work with `EdgeRuntime.waitUntil` and returns `{ ok: true, queued: true }`.
4. Discovery checks official source pages, registers new result links and enqueues ingestion. It also rechecks recent draws per denomination.
5. A worker downloads/validates files, stores raw versions and replaces parsed results transactionally. SQL rematches eligible saved bonds.
6. Reconciliation also rematches existing stored results. It does not itself download a missing historical archive or perform OCR on an unreadable scan.
7. While the app is active it reloads approximately every 30 seconds. App startup/foregrounding also refreshes state. Five-minute server worker scheduling continues persistent queue processing.

This is **asynchronous**. Returning from the button does not mean every queued job has finished or every document is verified. A pending counter or unresolved draw must not be interpreted as a clean no-win report. Repeated taps do not repair missing source data.

Future normal source discovery/ingestion and SQL matching run on the server, including while the phone is closed. National Savings does not send the app a webhook: the app's backend polls official pages. No Android push-notification service has been activated; opening the app is needed to see new server results.

### What the owner should enter

- Denomination, six-digit number and actual purchase/acquisition date.
- `007447` is accepted; `AB007447` is also accepted.
- Letters are optional for matching. If physically distinct bonds have the same number in different series, recording their letters helps identify the separate holdings.
- Leading zeros are significant and preserved. Do not enter `7447` as a substitute for a six-digit holding number.
- Single, Range, Paste and CSV are available. Range includes both endpoints and has a 2,000-number cap. Prefixes must agree at both ends; numeric-only ranges are accepted.
- Holder and note/location are optional. CSV requires `number,denomination,purchased_on`; optional columns include series, holder and note.

The nine current dummy holdings are test fixtures, not the father's real portfolio. A permanent owner account still needs setup/enrollment before treating the dummy environment as the owner's long-term personal account.

## 5. Starting state before today's integration

The project was already a React Native app with Android/iOS projects, React 19.3, React Native 0.88 and TypeScript. It had its own green/gold/cream theme system, reusable components and a local AsyncStorage store.

It already had splash/auth/loading screens, Home cards, bond rows, denomination breakdown, bottom navigation, Single/Range/Paste entry, preview/edit sheets, claims, archive/delete, workspaces, exports and local backups. Local accounts and demo draw data did **not** constitute Supabase authentication or official National Savings ingestion.

The initial target Supabase inspection found no application tables, migrations, Edge Functions or Auth users. A platform RLS event trigger existed and was retained with unnecessary client privileges removed. Global tools/configurations for other Supabase projects were not to be used.

Archive extraction was checked: all 1,160 extracted files matched hashes; only three generated C++ objects with Windows long paths were skipped. No source file was missing.

An initial simplified cloud route bypassed the original branded screens and omitted the full View all flow. The owner identified this regression. Today's final implementation restores the original visual components and routes them to cloud-backed data.

## 6. Application changes completed and why

| Area | Final change | Reason |
|---|---|---|
| Root routing | Cloud session startup with original animated splash and loading/logout screens | Preserve the original user flow |
| Login/signup | Shared original AuthShell, Logo, PasswordInput, Rules; real Supabase calls | Keep the design while replacing demo authentication |
| Enrollment | Specific Auth account must be an app owner | Do not grant private-portfolio access to arbitrary public registrations |
| Session | OS Keychain for cloud session; owner-specific cached snapshots | Restore login across app updates/startup |
| Home | Original greeting, statistics, denomination table, badges, preview and navigation | Restore missing portfolio screens |
| View all | Separate FullModal with virtualized FlatList, search and denomination filter | Full list must remain accessible beyond Home's preview |
| Entry | Six digits, optional prefix, required date; Single/Range/Paste and CSV | Accurate ownership matching and practical bulk input |
| Range | Inclusive, zero-preserving, maximum 2,000; staged review/confirmation | Avoid wrong or partially uploaded ranges |
| Results | Original grouped result design; draw/date/tier/amount; provisional separated | Do not mix uncertain results into verified prize totals |
| Acknowledgment | Mark as seen persists without inventing a claim/payment | Separate awareness from financial receipt |
| Claim | Actual received amount; provisional claim guard in UI and SQL | Do not claim uncertainty as a verified payout |
| Date changes | Rematch and remove earlier ineligible wins; warning on renewal/date edit | Preserve the owner's corrected date rule |
| Native integration | Android Kotlin file picker/fetcher; iOS Swift/bridge and project references | Device import and controlled fetching fallback |
| Network refresh | Server snapshot still reloads if native official fetch fails | A source outage must not hide fresh stored wins/corrections |
| Coverage warning | Combined text into one string for native Text rendering | Physical testing found an otherwise blank warning panel |
| Version | Android 1.7.1, code 9 | Identify the final installed warning-fixed build |

Important files: `App.tsx`, `src/store/AppStore.tsx`, `src/cloud/`, `src/data/`, `src/screens/AllBondsScreen.tsx`, original screens/sheets, Android file-picker package and iOS bridge files.

No speculative after-tax estimate is presented as a verified received payment. Existing local/demo storage was not automatically uploaded as genuine holdings. The reference parser was reused; integration normalization/validation lives around it.

## 7. Backend architecture and data ownership

The database is authoritative for cloud holdings and matching. Key areas include:

- Active denomination source configuration and prize structures.
- Owner enrollment and owner-scoped bonds protected by RLS.
- Draws, candidate files, retained raw versions, accepted file hashes and parsed numbers.
- Wins, acknowledgments, claim fields and draw-check records.
- Persistent leased ingestion queue, operational events and heartbeat state.
- Private raw-file and backup storage buckets.

Six supported denominations: **100, 200, 750, 1500, 25000, 40000**. Unsupported legacy denominations are validation/migration exceptions; they must not disappear silently or be reported as automatically covered.

RLS and sensitive RPC privileges were tested. Scheduler authentication is separate from owner authentication. Eight Edge Functions have gateway `verify_jwt=false` because handlers enforce real owner JWT or scheduler-secret checks themselves; this must not be described as anonymous administrative access.

Do not bundle a service-role key, scheduler secret, personal access token, DB password or test session. The app configuration generator emits only public settings. `.env`, generated public config, `.verification` and build caches are ignored by Git.

## 8. Fifteen migrations applied to the actual project

Local filenames were aligned to the real remote migration versions, avoiding accidental replay in a later CLI push.

| Version | Purpose |
|---|---|
| 20261027072710 | Initial automation schema, RLS, matching and queue functions |
| 20261027072721 | Shared fetch-slot/rate controls |
| 20261027072723 | Discovery jobs |
| 20261027072725 | Queue reuse, retries and rerun recovery |
| 20261027072726 | Win acknowledgment |
| 20261027072729 | Pakistan-time polling policy |
| 20261027072918 | Scheduler authentication |
| 20261027072956 | In-database Vault credential provisioning |
| 20261027073238 | Database schedules |
| 20261027073418 | Bounded worker dispatch |
| 20261027074148 | Device-fetch state |
| 20261027091437 | Result validation/approval integrity guards |
| 20261027093547 | Batch matching lock strategy and Rs100 structures |
| 20261027101646 | Strict purchase-date eligibility |
| 20261027104137 | Owner helper RPC privilege correction |

Do not blindly apply these migrations again to the live project. Compare `supabase_migrations.schema_migrations`/the MCP migration list first. Use a new migration for a new schema change.

## 9. Eight deployed Edge Functions

| Function | Role |
|---|---|
| connectivity-spike | Authenticated official-fetch/PDF diagnostic |
| discover | Scheduled/authorized discovery and processing kickoff |
| worker | Bounded leased queue processing |
| heartbeat | Authenticated keep-alive and heartbeat write |
| check-now | Owner-triggered discovery plus requested reconciliation/action |
| upload-draw-file | Guarded manual source-file fallback |
| approve-draw | Guarded complete-result approval with exact file hash |
| device-sync | Controlled authenticated source/file fetching from the device |

Shared implementation is in `supabase/functions/_shared/`. Automatic bounded text extraction uses pinned `unpdf@1.9.1` for PDF and `fflate@0.8.2` for DOCX. The separate Node/Python document worker supports additional legacy formats but has not been proven as a scheduled production service.

## 10. Result integrity, number parsing and matching changes

- Winning comparison is denomination + the exact six-digit text value, with optional series excluded from winning-number comparison.
- Purchase date is required and the draw must be strictly later. No hidden extra 60-day cloud filter is applied. This is the requested ownership rule, not a legal claim-eligibility determination.
- Updating purchase date rematches and deletes wins that no longer meet the rule.
- Bond and result mutations use a common advisory-lock order. Statement-level batch triggers avoid thousands of separate full reconciliations for a range insert.
- Result acceptance requires complete, consistent tier counts. Unknown/partial structures do not automatically become verified.
- Manual approval requires the accepted raw-file SHA-256 and complete expected tier counts. The obsolete three-argument approval form was removed.
- Provisional matches cannot be saved as verified claims. Possible wins are excluded from verified gross totals.
- Source failure preserves old candidate data provisionally rather than asserting a fresh successful no-win check.
- Rs100 older count configuration was corrected using real draws #25, #48, #49 and #50, which explicitly declare 1,199 third prizes. Configuration history is preserved.
- CR-only text is normalized to LF before parsing; original raw bytes/hashes remain untouched.
- Joined long numeric strings can create six-digit provisional candidates; they are never silently promoted to certain wins.
- Revisions and corrections replace result numbers and recompute matches. Latest known draws are revisited during discovery; completeness for every old same-URL correction has not been proven forever.

## 11. Official HTTPS failure and secure repair

Initial server and phone requests failed with `UnknownIssuer`. National Savings supplied a leaf certificate for `*.savings.gov.pk` issued by **GoGetSSL RSA DV SSL CA 2**, but supplied an older, mismatched intermediate chain.

The correct public intermediate was downloaded from the leaf's issuer AIA URL, `http://crt.sectigo.com/GoGetSSLRSADVSSLCA2.crt`. Its signature was cryptographically checked against the runtime's built-in Sectigo Public Server Authentication Root R46. Trust came from that root/signature verification, not from accepting HTTP transport as authoritative.

Certificate SHA-256:

```text
B5:28:67:96:DA:DF:16:52:1D:E4:17:72:AB:2F:DB:58:18:72:99:71:B5:27:47:21:14:6C:6E:81:72:BE:FE:07
```

`official-ca.mjs` contains the public certificate; `official-fetch.ts` supplies it to the Deno HTTP client. Certificate expiry/hostname validation and the official-host allowlist remain enabled. Ingestion did not disable TLS verification.

After repair, live list/TXT/PDF probes returned HTTP 200 and the real corpus was ingested. A later Rs1500 scan probe fetched 1,638,992 bytes, extracted only two whitespace characters in approximately 75 ms, and correctly established that normal text extraction is insufficient.

The physical Android native fallback still rejects the site's defective chain. The app skips that fallback when server discovery is healthy. Do not describe native fallback as fully verified operational during a server outage. A diagnostic Java TLS probe was used only for certificate inspection; it was not an insecure ingestion route.

Later 20-second request aborts affected all six official source pages around 11:34–11:40 UTC. Discovery recovered at 11:50:25 UTC. This establishes intermittent external availability, not continuous uptime. The original certificate fault and subsequent timeouts are separate issues.

## 12. Server scheduling and future automation

All four pg_cron jobs were rechecked and active:

| Job | UTC cron | Meaning |
|---|---|---|
| bondcheck-discover | `17 * * * *` | Hourly opportunity, guarded by Pakistan polling policy |
| bondcheck-worker | `*/5 * * * *` | Process runnable persisted jobs |
| bondcheck-heartbeat | `13 2 * * *` | Daily API/database heartbeat |
| bondcheck-watchdog | `43 2 * * *` | Daily discovery/lease watchdog |

Polling policy: hour 06 PKT daily; hourly on days 10, 11, 15, 16 and 17; every two hours on other days within 9–22. This changes polling intensity; it does not invent a publication or guarantee exact publication-time discovery.

Scheduler credentials were generated inside PostgreSQL Vault and were not printed or exported into the app. A service-role-only validator supports Edge authentication without exposing the secret to owners/anonymous clients.

Queue recovery uses leases, row locks/SKIP LOCKED, rerun flags, deduplication, backoff and bounded follow-up dispatch. The background queue persists when the phone closes. In one observed processing snapshot the queue drained completely; later legitimate polling creates new work, so current queue counts must be freshly inspected.

Authenticated heartbeat HTTP 200 and the real heartbeat write were verified. An unauthenticated worker returned HTTP 401. Real cron discovery/worker success and actual ingestion were observed. Daily cron timing, an extended outage and future publication are not all proven merely by registering jobs.

`.github/workflows/pipeline.yml` defines independent heartbeat/discovery, legacy conversion and weekly holding backups. It is **not proven activated**: remote push failed and repository secrets/actual scheduled runs were not verified. Do not count it as a working independent fallback. A paused Supabase project also cannot restore itself using its own paused cron.

## 13. Actual official corpus and timestamped snapshots

| Metric | Observed value |
|---|---:|
| Denomination sources | 6 |
| Official draws | 177 |
| Verified `ok` draws | 164 |
| `needs_ocr` | 5 |
| `needs_review` | 7 |
| `incomplete` | 1 |
| Number rows | 245,393 |
| Candidate/raw file versions recorded | 185 |
| Raw bytes recorded | 23,172,077 |
| Earliest available listed draw | 2019-01-15 |
| Latest available listed draw | 2026-10-15 |

The earlier processing snapshot was 224 done / zero queued / zero failed jobs. A later handoff SQL snapshot at **11:55:53 UTC / 16:55:53 PKT** showed **243 done, two queued and one running**, no failed jobs; latest successful discovery was **11:50:25 UTC**, and latest ingestion **11:55:30 UTC**. These are changing operational snapshots, not contradictory fixed totals.

No official pre-2019 corpus has been established. A synthetic regression test for the 2016/2015 ownership rule is not evidence that real 2015 draw results have been imported. Do not confuse policy tests with data coverage.

An empty queue or zero failed jobs also does not mean all source documents are usable. Read draw states, source timestamps and operational events as well as queue counts.

**Final post-button completion snapshot — 12:09:06 UTC / 17:09:06 PKT:** the live queue contained **263 done jobs and zero queued, running or failed jobs**. Successful discovery advanced to **11:56:53 UTC**, after the physical Run check now press, and successful ingestion advanced to **12:05:11 UTC**. Draw states remained **164 ok, five needs_ocr, seven needs_review and one incomplete**. This is evidence that asynchronous checking actually progressed and drained, rather than only returning a queued response. It still did not resolve the 13 source exceptions.

### All 13 unresolved draws at this snapshot

| Denomination | Draw date | State | Known issue |
|---:|---|---|---|
| 100 | 2019-08-15 | needs_ocr | Scan/PDF lacks usable result text |
| 100 | 2020-08-15 | needs_ocr | Scan/PDF lacks usable result text |
| 100 | 2021-08-15 | needs_review | Missing/ambiguous header/structure and partial tiers |
| 200 | 2019-09-16 | needs_review | Repeated zero cells and count mismatch |
| 200 | 2022-03-15 | needs_review | Repeated zero cells and count mismatch |
| 750 | 2024-01-15 | incomplete | Legacy Word/first-page candidate needs complete source |
| 750 | 2024-10-15 | needs_review | First/second tiers not reliably extracted |
| 750 | 2026-10-15 | needs_review | Short token 7447; candidate 007447 remains provisional |
| 1500 | 2026-08-17 | needs_ocr | Image-only PDF; ordinary extraction returns whitespace |
| 25000 | 2023-12-11 | needs_ocr | Needs OCR or verified readable alternative |
| 40000 | 2019-03-11 | needs_review | Repeated zero cells / third-tier mismatch |
| 40000 | 2020-12-10 | needs_review | First prize not reliably extracted |
| 40000 | 2023-12-12 | needs_ocr | Needs OCR or verified readable alternative |

In particular, the latest Rs750 draw is unresolved. It is unsafe to treat all holdings as definitively non-winning in that draw. Do not fill gaps with invented numbers, loosen count guards to force a green status, or approve partial results merely to satisfy the owner's request for certainty.

## 14. Automated verification actually completed

| Check | Observed result / scope |
|---|---|
| Remote pgTAP | **40/40 passed**, transaction rolled back |
| TypeScript | Passed, including final warning correction |
| Jest | **6 suites / 14 tests passed** on final source |
| Automation integration | **19 tests passed** |
| Bearer parser reference | Passed; reference implementation preserved |
| Premium parser | Passed |
| Python document conversion | **3 tests passed** |
| Full ESLint before final display correction | **0 errors / 404 warnings** |
| Targeted ESLint after final display correction | **0 errors / 13 warnings** across the changed files |
| Android release | **1.7.1/code 9 built successfully**, arm64-v8a |
| iOS build | **Not run** on Windows |
| Deno static check | Local dependency check hit offline ENOTCACHED; not claimed as passed |
| GitHub Actions | Workflow files exist; no successful remote CI run claimed because push failed |

pgTAP covers the earlier-draw exclusion, same-day exclusion, later-draw inclusion, purchase-date edits, denomination/series semantics, correction, idempotency, RLS, leases, incomplete approval rejection and failure preservation. A test namespace/date collision with real stored draws was corrected so test data does not accidentally collide with the official corpus.

A separate rolled-back benchmark inserted **2,000 holdings** against the actual corpus: about **495 ms**, **112 matches**, **zero date-ineligible wins**, and six-digit `000001` preserved. This is a measured database result, not a promise of identical speed for every phone, range or network.

The final UI regression test verifies that the coverage counts and incomplete warning appear inside native Text. Previously separate string children bypassed `Res`'s text wrapper, producing a blank warning panel; physical testing found and corrected this.

No broad automated suite was rerun just because handoff/Git documentation changed. Existing source-level evidence remains applicable; new code changes in a later session need their appropriate checks.

## 15. Physical phone, APK and build history

| Item | Observed |
|---|---|
| Phone | Infinix X6886 |
| USB serial | `151747057T005225` |
| Architecture / display | arm64, 1080 × 2400 |
| Package | `com.bondcheck` |
| Final installed version | 1.7.1 / code 9 |
| Package update time | 2026-10-27 16:46:03 PKT |
| Android min / target | 24 / 36 |
| APK | `android/app/build/outputs/apk/release/app-release.apk` |
| Signing | Existing repository debug keystore used for release installation; not Play distribution signing |

Final APK SHA-256:

```text
53924174A8D979809E1C53A2E0BAA10D9DBFF8694F3C285B9970ECACA9BB981D
```

The previously tested 1.7/code 8 APK hash was `8FABC8F72B98554C7702B741CE910B3A0F5CFFC36DFC84F51F58E2EC468F4095`. It is historical evidence; do not present old screenshots as verification of a later build.

Build timing was slow on this Windows machine. An initial full build took about 52m17s, intermediate warmed builds about 4m19s and 8m54s, and the final warning-fixed build **17m09s**. The last rebuild had a concrete reason: the blank incomplete-warning panel found on the device. No further source/APK change was made for this handoff. Avoid repeating builds unless native/source changes or unresolved build evidence justify it.

The final APK was installed with `adb install -r`. No uninstall or data clear occurred. The cloud session and test data survived the update. Final AndroidRuntime/ReactNativeJS error-log inspection returned no entries. This is a scoped check, not proof that every possible device/runtime state is crash-free.

## 16. Dummy account and actual official-data test

The phone is deliberately left signed into an isolated temporary owner, with **nine TEST ONLY holdings**, **two expected verified wins** and **Rs1,500,000 gross test prize value**. These are hypothetical holdings, not real entitlement or actual money received.

Credentials/fixture identifiers remain only in ignored `.verification/device-test.json` on this workspace. Do not paste its password/tokens into chat, Git, screenshots or this handoff. A later session can use that local file to scope cleanup if the owner requests it. Do not delete all accounts/holdings or touch another owner's data.

Earlier synthetic scenarios used a 1900 draw. That synthetic draw was deleted. The final physical positive/negative test uses an actual ingested official source, not fabricated winning-number rows:

```text
Rs200 draw #107 — 15 September 2026
https://savings.gov.pk/wp-content/uploads/2026/09/200_150926.txt
First prize: 516806 — Rs750,000
Accepted raw SHA-256:
7a535584ce5182437e27809e5eda393fdf7136e668cf1ec814ad8452cbd5edbb
```

Retained raw bytes were downloaded from private storage, independently hash-checked and their header inspected. A fresh direct PC download timed out during that test; the stored-file check is not falsely labelled a new successful PC website fetch. Later successful server discovery/ingestion is separately timestamped above.

| Dummy holding | Purchase date | Expected / actual in this draw |
|---|---|---|
| Rs200 AB516806 | 2026-09-14 | One verified win / one |
| Rs200 516806, no series | 2026-09-14 | One verified win / one |
| Rs200 CD516806 | 2026-09-16 | No win / none |
| Rs200 EF516806 | 2026-09-15 | No win / none |
| Rs750 GH516806 | 2026-09-14 | No Rs200 win / none |
| Rs200 NW000001 | 2026-09-14 | No win in this draw / none |

Normal holding insert triggers generated these matches. No manual recompute call or fake official-number insertion was used for these six cases. Authenticated owner assertions passed for all six cases. Live SQL found **zero date-ineligible wins**.

Three more rows, Rs750 `000111`–`000113`, were entered on the physical phone through **Add → Range → Preview → Save → Yes, save 3**, without letters and with purchase date 19 October 2026. All three persisted with exact leading zeros and no historical win after their date.

### Phone flows verified

- Original Home cards, denomination table, navigation and View all button.
- Earlier `007447` search returned exactly the expected three rows of the earlier fixture.
- Final `516806` search returned five rows; only AB516806 and no-series 516806 had win badges. Later/same-day/wrong-denomination rows had active badges.
- Results grouped the two wins under the correct Rs200 draw #107/date, each Rs750,000.
- Mark as seen for AB516806 persisted in SQL and across the APK update. Claim date and received-payment fields stayed empty.
- The final Home/Results coverage warning visibly reports incomplete verification.
- **Run check now** was pressed once on final APK 1.7.1. The request returned, the button was enabled again and status showed three pending jobs while background processing continued.
- The app was returned to Home, signed into the dummy account.

The last handoff snapshot still had exactly nine holdings for that owner, all TEST ONLY. Do not claim that the father's real list has already been entered merely because dummy holdings exist.

## 17. Local evidence and what is intentionally not pushed

Ignored `.verification/` contains logs, generated bundles, diagnostics, screenshots, raw official samples and temporary credentials. Important evidence includes:

| Evidence | What it proves |
|---|---|
| mobile-final-home-171.png | Final app version's visible coverage warning and 9/2 totals |
| mobile-final-search-171.png | Five search hits, only two correct win badges |
| mobile-final-results-171.png | Correct draw grouping, amounts and persisted acknowledgment |
| mobile-run-check-now-171.png | Physical asynchronous check request/status |
| mobile-all-search-17.png | Earlier restored list/search behavior |
| official-device-test.json | Hash/header, six scenario assertions, three numeric range rows |
| official-samples/200-107.txt | Retained official raw sample used for independent verification |
| jest-final.log | Final 6 suites / 14 tests pass |
| lint-final.log | Full lint baseline at 0 errors / 404 warnings |
| lint-warning-fix.log | Targeted final lint at 0 errors / 13 warnings |
| device-ui.mjs | Scoped ADB UI helper; reads test credentials only for login |
| review-staged.mjs | Local high-signal staged secret/material check |

`mobile-home-verified.png` is an earlier misleading filename for a stale provisional screen. Do not cite it as final verified evidence. Use the final `171` screenshots.

The APK, `.env`, generated configuration, `.verification`, passwords, tokens, build outputs and caches were not staged. The staged implementation secret/material scan checked all 104 files and found no high-signal private-key/token/secret/local-artifact matches. This is a practical review, not a mathematical proof that arbitrary secrets can never be present.

`git diff --cached --check` passes when excluding `automation/test-rs100-200-750-1500.mjs`. That reference test embeds official tabular text with significant/retained trailing whitespace; do not reformat those supplied fixtures to silence a whitespace warning. No unrelated source change was made for that warning.

A portable Git backup is retained at ignored `.verification/BondCheck-2026-10-27-handoff.bundle`. It contains the complete feature-branch Git history, and `git bundle verify` passed. It is regenerated after the final documentation commit so it includes the latest handoff. This is a local recovery artifact, not a GitHub push. On another authorized workspace it can be inspected with `git bundle list-heads <bundle-path>` and fetched/cloned using ordinary Git bundle support. The ignored credentials, screenshots and APK are not included in that Git history.

## 18. Remaining work — explicitly NOT finished

| Priority | Remaining work | Done condition / missing evidence |
|---|---|---|
| P0 delivery | Push feature branch and handoff commit | GitHub accepts the push; `ls-remote` equals local HEAD; respect no Credential Manager changes |
| P0 coverage | Resolve the five OCR draws | Complete trustworthy extraction, validated tier counts/raw provenance and independent number checks |
| P0 coverage | Resolve seven review draws and one incomplete draw | Correct source content/format handling; no partial/manual approval shortcut |
| P0 history | Establish the older required official history | Verified pre-2019 sources ingested; reconcile ownership from actual acquisition dates |
| P0 owner setup | Create/confirm/enroll the permanent owner | Explicit real account is enrolled, RLS tested for it; retain/remove dummy only as instructed |
| P1 reliability | Recheck intermittent official fetch failures and retries | Fresh discovery/ingestion succeeds repeatedly; outage states do not imply no win |
| P1 fallback | Native TLS fallback and independent document worker | Real controlled phone fallback works securely during server failure; legacy converter is operational |
| P1 scheduling | Prove independent GitHub service/backups | Authorized secrets, appropriate branch/triggers and successful real runs verified |
| P1 future scenario | Observe/replay a real new publication end to end | Discovery → raw storage → complete parsing → matching existing bonds → refreshed phone result |
| P1 recovery | Extended outage/paused-project recovery drill | Recovery and lease retry work; no missed-result claim after a long gap |
| P1 verification | Deno static checks / remote CI | Dependencies available, Deno check passes, real CI result recorded after successful push |
| P1 account | Production password recovery and leaked-password protection | Configured supported recovery flow and verified account security settings |
| P1 product | Ownership end dates/transfer/renewal intervals | Explicit multi-interval ledger if required; archive is not currently a complete ownership-end history |
| P1 backups | Full financial backup/restore drill | Holding and claim/result/account relationships restored and validated; current weekly script backs up holdings |
| P2 delivery | Production signing / distribution | Owner-controlled production signing; existing debug key is not Play release assurance |
| P2 platform | iOS native build/device verification | Build and real-device checks on a supported macOS/iOS environment |
| P2 notifications | Push notifications if required | Explicit service configuration and actual background notification test; currently none |
| P2 hygiene | Existing lint warnings | Review deliberately; do not hide them or rewrite the design for warning count |

There **is remaining work**. The task is not “everything done except a nicer report.” In particular, the owner cannot yet safely treat the app's no-win list as a complete independent replacement for all missing/uncertain historical official results.

## 19. Known boundaries that a next session must not overlook

- App signup and private owner enrollment are separate. Public signup must not silently make an arbitrary visitor the portfolio owner. Local `supabase/config.toml` also has signup disabled for its local setup; inspect actual hosted Auth configuration before assuming a production registration/recovery behavior.
- No real owner email/account has been supplied/enrolled in this session. The Git commit email is not an instruction to make that email the app owner.
- Series can distinguish physical holdings, but entering the same physical holding once bare and once with letters can create a data-entry duplication. The two positive dummy rows intentionally represent separate hypothetical holdings for series semantics. Do not promise duplicate physical ownership can be inferred automatically from incomplete identity data.
- Archive/renewal is not a complete historical ownership-period ledger. Editing the start date changes historical eligibility and may remove earlier wins.
- Raw text extraction is not OCR. A PDF fetch HTTP 200 does not establish readable or complete winning numbers.
- A generic zero-failed-jobs count is not proof every draw is verified. Review source timestamps, attention states and events.
- Database schedules require a running Supabase project. Independent restoration/keep-alive cannot be assumed from YAML alone.
- No pushed branch or successful GitHub Actions run exists merely because local Git created a commit. Confirm the remote ref.
- Keep original UI, exact number text and dates. Avoid further blind APK builds, forced approvals or “100%” wording to satisfy frustration.

## 20. Recommended continuation order

1. Read this file, `DEEP_DETAILED_AUDIT.md`, `VERIFICATION_LOG.md` and `RUNBOOK.md`. Treat `APP_AUDIT.md` as the historical baseline.
2. Inspect current branch/HEAD/working tree and confirm implementation commit. Resolve authorized push access while respecting the owner's Credential Manager restriction.
3. Reinspect current Supabase counts, draw states, last discovery/ingestion, job leases, functions/migrations and advisors. Do not replay applied migrations or seed fake official results.
4. Obtain/enroll the intended permanent app owner; keep genuine holdings separate from TEST ONLY fixtures. Do not wipe the phone or bulk-delete data.
5. Work through all 13 source exceptions with readable official alternatives/OCR plus strict validation. Preserve provenance, uncertainty and previous versions.
6. Establish the owner's older required official history. Test exact earlier/same-day/later acquisition scenarios with real retained sources as well as regression fixtures.
7. Recheck live Run check now completion, new publication/correction flow and app display. Do not stop at the queued acknowledgment.
8. Complete needed independent scheduling, secure fallback, recovery, backup and CI evidence. Run tests appropriate to actual new code changes.
9. Build/install a new APK only when app/native changes require it. Verify the exact new version, preserve data and distinguish new screenshots from old ones.
10. Update the dated evidence and remaining-work status, commit and push to the feature branch, verifying the remote SHA.

## 21. Useful commands and operational cautions

Read-only Git inspection:

```powershell
git status --short --branch
git log -3 --oneline
git show --stat 6346477
git remote -v
git ls-remote origin refs/heads/feat/official-results-automation-2026-10-27
```

Once authorized push access exists, push the existing commits rather than starting a new unrelated history:

```powershell
git push --set-upstream origin feat/official-results-automation-2026-10-27
git rev-parse HEAD
git ls-remote origin refs/heads/feat/official-results-automation-2026-10-27
```

Relevant local checks when code changes justify them:

```powershell
npm.cmd run typecheck
npm.cmd test -- --runInBand
npm.cmd run test:automation
npm.cmd run test:parser
python automation/test-document-converter.py
npm.cmd run lint
```

Database regression source: `supabase/tests/database/automation.test.sql`. It must run with rollback isolation; do not leave test owners/draws mixed into official data. CLI/Docker local testing and Deno checks were not universally available here; use the actual environment and record what ran.

The previously authorized Android command, from `android/`, is:

```powershell
& .\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon --offline --max-workers=2
```

Install only after a successful build, from the repository root:

```powershell
adb -s 151747057T005225 install -r android/app/build/outputs/apk/release/app-release.apk
adb -s 151747057T005225 shell monkey -p com.bondcheck -c android.intent.category.LAUNCHER 1
adb -s 151747057T005225 shell dumpsys package com.bondcheck
```

Use ADB only while BondCheck is foregrounded for UI inspection. The ignored helper guards the package before dumps/screenshots. Its old login action looks for `Sign in`; the final screen says `Log in`, so update that ignored helper before using its login automation again. Do not clear app data to work around a helper mismatch.

Credentials, broad account changes and other Supabase projects are not required for ordinary file review. Respect Windows path/permission boundaries and use task-scoped temporary paths. Do not share scheduler secrets or overwrite cloud state to speed up an audit.

## 22. Final owner-facing readiness statement

The original design is restored, the final APK is installed, and tested matching/date/range/search scenarios behave correctly. Saved eligible history matches automatically, and Run check now starts real asynchronous discovery/reconciliation. Fresh server discovery recovered after a timeout incident.

**It is still not accurate to promise “add all of Abbu's bonds and every historical/future win will be caught with 100% certainty.”** Thirteen official draws remain unresolved, older history is missing, independent recovery/fallback evidence is incomplete, and permanent owner setup and remote push are pending. Carry those facts into the next session instead of resetting the explanation or pretending the remaining work is zero.
