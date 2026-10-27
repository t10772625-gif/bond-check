# Existing application audit

Inspected 27 October 2026, before automation changes.

Historical baseline only. The owner's later instruction supersedes the no-purchase-date requirement quoted below: current cloud matching requires **draw_date > purchased_on**. Current implementation/device evidence is in `DEEP_DETAILED_AUDIT.md` and `VERIFICATION_LOG.md`; use the dated session handoff for continuation.

- React Native 0.88, React 19.3, TypeScript; Android and iOS projects. Existing UI is English.
- `AppStore.tsx` stores the database, preferences and drafts in AsyncStorage (`bondcheck.v4`, `bondcheck.prefs`, `bondcheck.draft`). It is not a browser localStorage application.
- Existing accounts, passwords, workspaces and demo draws are local to the device. They are not Supabase accounts or official results.
- Bonds use numeric local IDs, prefixed strings such as `BD123400`, denomination `d`, purchase date and embedded wins. Migration must separate the prefix from the six-digit number and preserve the local backup.
- Existing checking uses full prefixed strings and excludes bonds purchased within 60 days of a draw. Automated historical matching must instead run in PostgreSQL on six-digit number plus denomination, without a purchase-date filter.
- Existing denominations omit 100 and 200 and include 7500/15000. Automation supports the six denominations in the supplied specification. Unsupported legacy rows must appear in migration validation, never disappear silently.
- Native storage, clipboard, sharing, keychain and safe-area modules need mocks in Jest. TypeScript and Metro Android bundling passed before integration. Lint had zero errors and 376 existing warnings. The app render test needs timer repair. A native Android build failed compiling Gradle-generated classes and has not passed.
- The original ZIP has 1163 files. All 1160 extracted files matched SHA-256; only three generated `.cxx` object files with long Windows paths were skipped. No source files were missing.
- No Supabase API key or application database configuration was present. Existing global MCP definitions point to a different project; they must not be used for this application.

The cloud repository must become authoritative only after configuration and authentication. The existing local database remains available for explicit backup and migration; it must never be uploaded automatically as demo data.
