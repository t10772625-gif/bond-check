# BondCheck

React Native prize-bond manager with a Supabase automation backend. The supplied National Savings parser is reused unchanged. Cloud mode matches six-digit number plus denomination against eligible stored draws strictly after purchase date, preserves leading zeros and displays unresolved draws and possible wins explicitly.

## Start locally

Use Node 22.13.0 (`nvm use 22.13.0`).

```powershell
npm ci
npm run configure
npm start
# In another terminal:
npm run android
```

Keep the public project URL/key in `.env` using `.env.example`. Only public settings are generated into the mobile bundle. Server credentials belong in Edge/CI secrets. Without a public key, the existing local mode remains available and is labelled disconnected from automatic checking.

## Verify

```powershell
npm run typecheck
npm test -- --runInBand
npm run test:parser
npm run test:automation
python automation/test-document-converter.py
npm run lint
```

With Docker and Supabase CLI: `supabase start`, then `supabase test db`.

## Connect and deploy

Target project: `dwagvpxegvixgztmovyx`. Fifteen migrations, eight functions and four database cron jobs are deployed. The recorded live corpus contains 177 draws (164 verified, 13 unresolved) and 245,393 number rows. Secure server ingestion succeeded after an intermediate-CA repair; later fresh discovery requests timed out, with scheduled retries active. Pre-2019 history is absent. The latest ownership rule is **draw date strictly after purchase date**. Android 1.7.1/code 9 is installed and tested on the physical phone with an isolated dummy account. A permanent owner account still needs enrollment; source exceptions and current fetch timeouts prevent a claim of 100% complete checking.

Read the [deep detailed audit](docs/DEEP_DETAILED_AUDIT.md) for the original/restored UI, View all/search, complete automation flow, date/range scenarios, test evidence and remaining limitations. Discovery recovered at 11:50 UTC after the observed timeouts; the physical Run check now flow was exercised. This does not resolve the 13 ambiguous/scanned draws.

Follow [the runbook](docs/RUNBOOK.md) for MCP/OAuth, owner setup, migrations, Edge Functions, the connectivity spike, scheduling, old-data migration and paused-project recovery. Current evidence and blockers are in [the verification log](docs/VERIFICATION_LOG.md) and [the Phase 0 report](docs/PHASE0_REPORT.md).

The backend is in `supabase/`, the reference parser/tests/corpus tools are in `automation/`, and cloud app/repository code is in `src/cloud/` and `src/data/`. PDF scans remain `needs_ocr` until explicitly processed/reviewed. No paid services have been activated.
