# Verification log — 27 October 2026

Target: **dwagvpxegvixgztmovyx**. This is the current evidence log; the [detailed audit](DEEP_DETAILED_AUDIT.md) contains the implementation inventory, data flow, source exceptions and remaining limits.

## Deployed system

- Initial inspection found no application tables, migrations, functions or Auth users. The target now has **15 applied migrations, eight Edge Functions and four active pg_cron jobs**. Local migration versions match the remote history.
- Server discovery runs hourly at minute 17 with the Pakistan-time polling policy. Runnable queue work is dispatched every five minutes with bounded follow-up dispatch. Heartbeat and watchdog have daily schedules. The scheduler credential was generated inside PostgreSQL Vault and never bundled in the APK.
- Real authenticated heartbeat returned HTTP 200 and wrote its timestamp; an unauthenticated worker returned HTTP 401. Successful cron discovery/worker executions were observed. Future publication and a ten-day outage have not been observed end to end.
- The official site's mismatched intermediate chain originally caused UnknownIssuer. A correctly signed, public GoGetSSL RSA DV SSL CA 2 intermediate repairs verified server HTTPS. Hostname/expiry verification remains enabled. Native fallback on this phone still rejects the site's faulty chain; healthy server fetching avoids that fallback.
- Edge PDF text/DOCX conversion is deployed. Scan-only OCR and the separate external document worker are not an operational unattended service. GitHub scheduling/backups and push notifications have not been activated.

## Official corpus — live SQL snapshot

| Metric | Observed |
|---|---:|
| Official draws discovered and processed | 177 |
| Verified draws | 164 |
| Needs OCR / review / incomplete | 5 / 7 / 1 |
| Stored number rows | 245,393 |
| Raw-file versions | 185 |
| Earliest / latest listed draw | 2019-01-15 / 2026-10-15 |
| Finished / queued / failed jobs at processing snapshot | 224 / 0 / 0 |

These counts do **not** mean all historical draws through today are fully verified. Pre-2019 coverage is absent and 13 discovered draws are unresolved; their full list is in the detailed audit. An empty queue does not resolve an ambiguous source file.

## Matching and integrity

- A win requires the same denomination and six-digit number, and **draw_date > purchased_on**. Purchase date is mandatory. Earlier and same-day draws are excluded, following the owner's corrected requirement.
- Series is optional and retained for identifying holdings; official number matching ignores it. Leading zeros are preserved. Single, paste, CSV and inclusive ranges up to 2,000 are supported.
- Statement-level batch matching and a common advisory lock prevent repeated range rematching and conflicting result/bond updates. Date edits remove newly ineligible wins.
- Result acceptance checks complete tier counts. Manual approval checks the exact raw hash and complete counts. Provisional matches cannot be claimed as verified. Failed downloads preserve prior data without declaring a fresh successful check.
- Rs100 count configuration was corrected against real official files. CR-only text is normalized before parsing; raw hashes remain unchanged. Joined digit candidates remain provisional.
- Owner RLS and scheduler privilege checks were tested. Anonymous access to the owner-helper RPC was revoked. Some intended security-definer RPCs remain exposed to authenticated users with internal checks. Leaked-password protection is still disabled/unconfigured.

## Automated verification

- Remote **pgTAP 40/40 passed**, with fixtures rolled back. Includes the 2016 purchase/2015 draw scenario, same-day exclusion, later-draw inclusion, date edits, denomination/series, correction, idempotency, RLS, leases, incomplete-approval rejection and outage retention.
- A rolled-back **2,000-bond** benchmark against the actual corpus took approximately **495 ms**, returned 112 matches and zero date-ineligible wins, and preserved `000001`.
- TypeScript, Jest, automation 19 tests, bearer/premium parser tests and Python conversion 3 tests passed before the final display-only correction.
- Full ESLint after comment-directive correction: **0 errors / 404 warnings**. Warnings remain; they are not described as a warning-free audit.
- The final display correction joins AutomationStatus text into one string, so the shared result panel wraps it in native Text. A regression test checks that both coverage counts and the incomplete warning are visible. Final build/test results are recorded below when completed.
- iOS native sources are updated but no iOS build has run on Windows.

## Physical Android test — latest completed pass

- Authorized Infinix X6886, USB serial `151747057T005225`, arm64. Version **1.7 / code 8** was installed successfully, preserving app data. No uninstall or data clear was used.
- Original Home statistics, denomination table, navigation, View all FlatList/search and Results layout were verified on the physical screen. Search `007447` returned exactly the three expected rows in the earlier four-bond fixture.
- Saved the numeric range **000111–000113** through Add → Range → Preview → confirmation. All three persisted in Supabase without a series prefix, with leading zeros and purchase date 2026-10-19.
- Replaced earlier synthetic matching fixtures with real-file scenarios. The synthetic 1900 draw was deleted; official draw count remains 177.
- Official Rs200 draw **#107, 2026-09-15**, accepted source `https://savings.gov.pk/wp-content/uploads/2026/09/200_150926.txt`. Stored raw bytes were downloaded and independently checked against SHA-256 `7a535584ce5182437e27809e5eda393fdf7136e668cf1ec814ad8452cbd5edbb`; their header identifies first prize number **516806**, Rs750,000. A fresh direct PC fetch timed out, so this is not represented as a new successful PC download.

| Dummy holding | Purchase date | Expected / observed in this draw |
|---|---|---|
| Rs200 AB516806 | 2026-09-14 | 1 verified win / 1 |
| Rs200 516806, no series | 2026-09-14 | 1 verified win / 1 |
| Rs200 CD516806 | 2026-09-16 | 0 / 0 |
| Rs200 EF516806 | 2026-09-15 | 0 / 0 |
| Rs750 GH516806 | 2026-09-14 | 0 / 0 |
| Rs200 NW000001 | 2026-09-14 | 0 / 0 |

No manual recompute call or fabricated winning-number row was used for these six cases: normal database bond triggers produced the wins. The phone showed **9 dummy bonds, 2 verified wins, Rs1,500,000 gross**, and the correct draw/date in Results. The six scenario assertions and three phone-saved range assertions passed through an authenticated owner session. Live SQL found **zero date-ineligible wins**.

Evidence is retained locally under ignored `.verification/`: `mobile-real-official-home-17.png`, `mobile-real-official-results-17.png`, `mobile-all-search-17.png`, `official-device-test.json` and the official raw sample. Passwords/tokens are not in this document.

## Test-account state and final update

The latest owner request explicitly asks for dummy account/data on the phone. The temporary, isolated owner account and nine labelled dummy holdings are therefore retained for inspection. They are **not real holdings or real prize claims**. Earlier rolled-back SQL/benchmark fixtures are absent, and the synthetic draw was removed. A permanent owner email/account still needs enrollment.

Final APK **1.7.1/code 9 built successfully** and was installed with `adb install -r` on the same phone. Package inspection confirms version 1.7.1/code 9 and update time **2026-10-27 16:46:03 Pakistan time**. SHA-256: `53924174A8D979809E1C53A2E0BAA10D9DBFF8694F3C285B9970ECACA9BB981D`.

The new Home screen physically shows the full coverage warning, **164 of 177 verified**, and the retained **9 bonds / 2 verified wins / Rs1,500,000 gross**. Session/data persisted through the APK update. Screenshot: `.verification/mobile-final-home-171.png`. Mark-as-seen was verified in the database for AB516806; no claim date or received payment was fabricated.

Final checks after the warning correction: **TypeScript passed; Jest 6 suites / 14 tests passed; targeted ESLint 0 errors / 13 warnings; Android release build passed**. The 40 database checks and other automation/parser/conversion checks above remain the applicable evidence; they were not needlessly repeated for a display-only change.

**Latest operational observation:** at 11:46 UTC the authenticated status still reported 177 draws, 164 verified, 13 attention, zero failed jobs and one pending job. The latest successful discovery remained **09:06:52 UTC**. Subsequent two discovery attempts at approximately 11:34–11:40 UTC logged 20-second request aborts for all six official denomination pages. This is a current external-fetch availability problem, distinct from the repaired certificate chain. Stored matches remain accessible; this snapshot does **not** establish that fresh official files can currently be downloaded. Scheduled retries remain active. Do not turn an old successful fetch into a claim of present uninterrupted availability.

Final physical pass on 1.7.1: search `516806` returned exactly five rows, with win badges only for AB516806 and the no-series holding. Results retained two wins under the correct draw/date and the saved acknowledgment. AndroidRuntime/ReactNativeJS error-log inspection returned no entries. The phone was left on Home, signed into the dummy account. Final evidence: `.verification/mobile-final-home-171.png`, `mobile-final-search-171.png`, `mobile-final-results-171.png`.

## Handoff follow-up — 11:55 UTC / 16:55 Pakistan time

Fresh discovery recovered after the timeouts: live heartbeat now records **last_discovery_ok 11:50:25 UTC** and **last_ingest_ok 11:55:30 UTC**. Counts remain 177 draws, 164 verified, 5 needs_ocr, 7 needs_review, 1 incomplete and 245,393 number rows. At 11:55:53 UTC, jobs were 243 done, 2 queued and 1 running; there were no failed jobs. These queue counts are a moving snapshot, not a fixed release property.

On physical APK 1.7.1 the **Run check now** button was pressed once. It returned to its normal enabled state and the screen showed three pending jobs while worker processing continued. Nine labelled dummy holdings, two expected wins and zero date-ineligible wins remained. This verifies accepted asynchronous checking, not a guarantee that unresolved files become verified after pressing the button. Evidence: `.verification/mobile-run-check-now-171.png`. The app was returned to Home.

The remaining 13 official source exceptions, missing pre-2019 history and observed intermittent fetch timeouts prevent a claim of 100% complete checking. See `SESSION_HANDOFF_2026-10-27.md` for the next session's complete starting point and remaining work.
