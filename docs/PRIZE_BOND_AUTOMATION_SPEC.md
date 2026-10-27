# Prize Bond Auto-Checker — Implementation Spec

> **27 October owner correction:** The active matching rule is now `draw_date > purchased_on`; purchase date is required. Earlier and same-day draws do not count as the owner's wins. This supersedes older paragraphs below that say to ignore purchase dates. Live official evidence also corrected Rs100 third-tier configuration from observed draw #25 onward to 1,199. Read `DEEP_DETAILED_AUDIT.md` for current behavior, evidence and unresolved coverage; the original specification below is retained for design history.

> **Audience:** Claude Code CLI (and the developer). **Owner:** a single user building this for his father ("abbu").
> **Status:** design complete, implementation not started. The parser, its tests and a corpus-checker already exist (see §22) and must be reused, not rewritten from scratch.
> **How to use this file:** read it fully once, then inspect the existing app repo (it currently stores everything in `localStorage`), then work through §19 phase by phase. Every phase has acceptance criteria. Do not skip the Phase 0 connectivity spike (§14). Where this spec says **VERIFY**, check it yourself against current docs/site before relying on it. Where it says **ASSUMED**, confirm with the user.

---

## 0. Summary in Roman Urdu (for the owner)

- Abbu sab bonds (sirf number + denomination) ek bar add karenge. Series ke letters ignore hote hain.
- System khud `savings.gov.pk` ki list pages se naye result links dhoondega, file download karega (pehle `.txt`, phir Excel, phir PDF), parse karega, tadaad verify karega, aur abbu ke saare bonds se match karega.
- Pehli bar saari purani draws (jitni website par hain, 2019 se) check hongi; uske baad sirf nayi draws, aur naya bond add ho to purani saari stored draws se foran check.
- Kuch bhi chup chaap miss nahi hoga: har draw ka status hoga (`ok` / `needs_review` / `failed` / ...), aur app dikhayegi "N draws mein se M verified".
- Supabase free plan 7 din inactivity par project pause kar deta hai; iska hal §13 mein hai (in-DB cron + bahar ka scheduler + heartbeat + monitoring).
- Excel mein kuch convert nahi karna. Files ko Excel mein khol bhi mat dena (leading zero kat jata hai).
- Sab kuch free tools par; paid (Supabase Pro $25/mo) sirf aakhri raasta.

---

## 1. Goal, scope, non-goals

### 1.1 Goal
Abbu enters all his prize bonds once. From then on the system, with **no manual visits to the National Savings website**, discovers every published draw result, downloads and parses it, verifies it, matches it against all his bonds (including **all historical draws on the website, not just the latest**), and shows the result in the app. Anything it cannot verify is surfaced explicitly — never skipped silently.

### 1.2 In scope
- Denominations: **Rs100, Rs200, Rs750, Rs1500** (bearer National Prize Bonds) and **Rs25,000, Rs40,000 premium (registered)** bonds.
- Official result files from `savings.gov.pk` (`.txt` preferred; Excel, PDF, `.doc` as fallbacks).
- One-time **backfill** of all historical draws available on the website, then incremental polling.
- Matching on **number + denomination** (series ignored).
- Supabase (PostgreSQL) backend added to the existing `localStorage` app; one-time migration of existing data.
- In-app result screens and a "draw status board".

### 1.3 Out of scope (unless the user changes his mind)
- Claiming prizes, tax computation, buying/selling bonds, multi-user/roles/sharing.
- Integrating with the **Pak Bond app** (no public API was found; third-party app scraping is fragile). Rejected.
- Rs7,500 and Rs15,000 denominations: they appear in the official search dropdown but not in the download list → **ASSUMED not held by abbu; ask the user**.
- Push notifications in v1 (see §15.6; optional later).

### 1.4 Non-negotiable principles
| # | Principle |
|---|---|
| P1 | Source of truth = official files on `savings.gov.pk`. News sites are only an optional cross-check for first/second prize numbers. |
| P2 | **Never silently skip or guess.** Every draw has a status; the UI shows completeness ("117 of 120 draws verified, 3 need review"). It must never claim "everything checked" while any draw is unresolved. |
| P3 | **Prefer a false alarm to a miss.** Uncertain parsed values produce *provisional* matches ("possible win — verify"), never silence. |
| P4 | Bond numbers are **strings of exactly 6 digits**; leading zeros are preserved everywhere (DB `char(6)`, JSON strings, no numeric casts). Files are never opened/converted with Excel. |
| P5 | **Series letters are ignored** for matching: one "single common draw" applies to every series (A…GJ etc.). The same 6-digit number in two series wins in both. |
| P6 | Every job is **idempotent** and re-runnable; re-ingesting a draw never duplicates rows. |
| P7 | Keep the **raw downloaded file + SHA-256** for every candidate; if a file changes later (corrections/"revised" files), re-parse, re-match, and flag the change. |
| P8 | Full historical check **once** (backfill), then incremental. Adding a new bond triggers an immediate check against **all** stored draws (no re-download). |
| P9 | **Free tier only** (Supabase free, free GitHub Actions, free OSS tools). Paid options only as a last resort and only with the user's approval. |
| P10 | Single user. Keep schema/auth simple; do not over-engineer roles or sharing. |

---

## 2. Evidence: what was verified vs assumed

| Item | Status | Detail |
|---|---|---|
| `https://savings.gov.pk/rs-750-prize-bond-draw/` | **Verified** (fetched) | Server-rendered page (not JS-built). One link per draw, link text = date `dd-mm-yyyy`, e.g. `15-01-2026 (Text)` / `15-01-2026 (pdf)`. Years 2019–2026 listed. |
| File types on that page | **Verified** | Mostly `.txt`; Jan-2026 has both `.txt` and `.pdf`; one link (15-01-2024) is a `.doc` named like `First-Page-97th-draw…` → **likely incomplete** (first page only). |
| File naming | **Verified** | Inconsistent (`DRAW-RESULT-OF-RS.-750-DENOMINATION-105.txt`, `Rs-750-107-draw.txt`, `750_15102026-1.txt`, `15-04-2024-Rs-750.txt` …). Upload folder = *upload* month (`/2024/11/` holds many old files). **URLs cannot be constructed; they must be scraped from the list page.** |
| `https://savings.gov.pk/download-draws/` | **Verified** (fetched) | Index page linking to per-denomination list pages. **Exact slugs for 100/200/1500/25000/40000 were not recorded → discover them from this page, do not hardcode.** |
| `https://www.savings.gov.pk/latest/results.php` (official search) | **Verified** (fetched) | Dropdowns: denomination (100, 200, 750, 1500, 7500, 15000, 25000, 40000, "40000 Premium Bond", "25000 Premium Bond"), draw date; **Range Search** (From–To); **list of numbers** (comma separated). Banner: *"We are updating the Database for Draw Results…"* and footer *"Errors and omissions are Expected"* → **never the sole source**. Form method/params **not inspected** → VERIFY with browser DevTools before using. |
| Raw HTML of list pages (anchor markup) | **ASSUMED** | Only the rendered text was seen. VERIFY via view-source; `extractDrawLinks()` regex may need adjusting. |
| WordPress REST (`/wp-json/wp/v2/media?search=…`) | **ASSUMED** | Upload paths are `wp-content/uploads/…` so it is WordPress. REST may be disabled. Optional secondary detector only. |
| Reachability of `savings.gov.pk` from Supabase Edge (foreign IPs) | **UNKNOWN** | Some `.gov.pk` sites block foreign IPs. **Phase 0 spike decides the architecture (§14).** |
| Pak Bond app API | **None found** | Rejected. |
| Supabase free-plan limits | **Verified via docs/search (Oct 2026), re-VERIFY** | §13. |

---

## 3. Data sources and discovery

### 3.1 Per-denomination list pages (primary)
1. Fetch `https://savings.gov.pk/download-draws/`; extract links to the denomination list pages (100, 200, 750, 1500, premium 25000, premium 40000). Store them in a config table (`sources`) so they can be edited without redeploying.
2. Known verified page: `https://savings.gov.pk/rs-750-prize-bond-draw/`.
3. On each list page extract every anchor whose `href` ends with `.txt|.pdf|.doc|.docx|.xls|.xlsx` and whose text contains a date `dd-mm-yyyy`. Output per anchor: `{date (ISO), kind, url, label}`. Resolve relative URLs against the site origin.
4. **Group candidates by `(denomination, date)`.** One date may have several candidates (txt + pdf + excel, or original + "Revised…"). Keep **all** of them as `draw_files` rows (see §10); choose per §5.4.
5. Reference implementation: `extractDrawLinks(html, baseUrl)` in `prizebond-parser.mjs` (prefers txt > xlsx > xls > pdf > docx > doc per date — but the production logic must keep *all* candidates, see §5.4).
6. The list **date** (link text) is authoritative for `draw_date`; the date inside the file (`HELD ON …`) is only a cross-check (warn on mismatch). Many files contain no date at all.

### 3.2 Secondary detector (optional)
- WordPress media REST endpoint (if enabled) as an extra way to notice new uploads. Not required.

### 3.3 Official search (`results.php`) — optional cross-check only
- Use for (a) confirming each **win** before showing it as "confirmed", and (b) a weekly sample audit (e.g. 5 random bonds): if the official search disagrees with our matcher, raise an alert (parser bug suspected).
- It supports comma-separated lists, so bonds can be checked in batches per denomination+draw.
- Be gentle: ≥1 s between requests, low volume, cache results. Must handle its own failure ("database being updated") without failing the pipeline.

### 3.4 News sites (optional cross-check)
- First/second prize numbers of recent draws appear on news sites (ProPakistani, ARY, Profit, TechJuice, Daily Pakistan). Optional sanity check only; never ingest full lists from them.

### 3.5 Etiquette
- Single-threaded fetching, 1 request/second max, descriptive `User-Agent`, conditional requests (`If-None-Match`/`If-Modified-Since`) on list pages, timeouts (≤20 s), exponential backoff, no hammering on failure.

---

## 4. Draw calendar and prize structures

### 4.1 Observed calendar (for polling intensity only — **never hardcode as truth**)
| Denomination | Months | Typical day | Examples seen |
|---|---|---|---|
| Rs750 | Jan, Apr, Jul, Oct | 15th | 15-01-2026 (105th), 15-10-2026 (108th, Rawalpindi) |
| Rs100, Rs1500 | Feb, May, Aug, Nov | 15th–17th | Rs100 53rd 16-02-2026; Rs1500 101st 17-02-2025 |
| Rs200 | Mar, Jun, Sep, Dec | 15th–20th | 97th 15-03-2024, 98th 20-06-2024, 105th 16-03-2026, 107th 15-09-2026 |
| Rs25,000 / Rs40,000 premium | Mar, Jun, Sep, Dec | 10th–11th | 13th 11-03-2024, 21st 10-03-2026, 23rd 10-09-2026, 38th (Rs40000) 10-09-2026 |

Roughly one draw somewhere almost every month. Draw numbers: Rs750 #108 = Oct 2026; Rs200 #107 = Sep 2026; Rs100 #53 = Feb 2026; Rs25000 #23 = Sep 2026; Rs40000 #38 = Sep 2026.
Dates drift (weekends/holidays: in 2023 Rs750 draws were on the 16th/17th). **Discovery is driven by "link on site that we do not have", not by the calendar.**

### 4.2 Prize structures (common numbers per draw = per series)
| Denomination | 1st prize | 2nd prize | 3rd prize | Total | Prize amounts (gross, PKR) 1st / 2nd / 3rd |
|---|---|---|---|---|---|
| Rs100 (Student Welfare) draws **< 51** | 1 | 3 | 1,696 | 1,700 | 700,000 / 200,000 / 1,000 |
| Rs100 draws **≥ 51** (from Aug 2025) | 1 | 3 | **1,199** | 1,203 | same |
| Rs200 | 1 | **5** | 2,394 | 2,400 | 750,000 / 250,000 / 1,250 |
| Rs750 | 1 | 3 | 1,696 | 1,700 | 1,500,000 / 500,000 / 9,300 |
| Rs1500 | 1 | 3 | 1,696 | 1,700 | 3,000,000 / 1,000,000 / 18,500 |
| Rs25,000 premium (registered) | **2** | 5 | 700 | 707 | 30,000,000 / 10,000,000 / 300,000 |
| Rs40,000 premium (registered) | 1 | 3 | 660 | 664 | 80,000,000 / 30,000,000 / 500,000 |

Notes:
- These are **config, not truth** (Rs100 changed from 1,696 to 1,199). Store in table `prize_structures` keyed by `(denomination, from_draw_no)` (§10). Files sometimes declare the third-prize count themselves, e.g. `(1199 Prizes of Rs. 1,000/- each)`, `(660 Prizes of Rs.500,000/- Each)`, `(700 Prizes of Rs.300,000/- Each)`. A mismatch between declared and configured count is a **warning**, not an error, **except** that some files print the *total* there (Rs200 107th prints `(2400 Prizes…)`; 1+5+2394 = 2400) — accept total as valid too.
- File text sometimes carries the wrong prize amount (Rs100 54th says "Rs.100/- each" instead of 1,000) → **take prize amounts from our config, never from file text.**
- Draw 2019–2023 structures may differ; the parser must treat an unconfigured/unknown structure as `needs_review` (not guess).
- A file header may name the wrong denomination (Rs200 107th says "PREMIUM PRIZE BONDS") → **denomination comes from which list page the link was found on**; header mismatch is a warning.

---

## 5. File formats: catalog, traps, and file-type handling

### 5.1 Catalog of real format variants seen (all must parse; each has a unit test in the delivered test files)
| Denomination / draw | Quirks |
|---|---|
| Rs750 101st, 108th | No "Third Prize" heading; only `PART - II` markers / none; page markers (`Page No.1/3`); placeholders `XXXXXX`; 101st header contains `000001 to 999999` (must not become winners); 11-column grids |
| Rs750 98th, 99th (Hyderabad/Quetta) | `DRAW OF Rs.750/- PRIZE BOND` (no "DENOMINATION"); `Draw No:98th`; `Date:15/04/2024`; dashed separator lines; `1696 Prize(s) of 9,300/- Each` heading-less; `xxxxxx` lowercase |
| Rs750 102nd | `-102nd DRAW`; `1696 Prizes of 9300/- each` without heading; `******` placeholders |
| Rs750 105th–107th | `â€“` mojibake (UTF-8 read as cp1252); headings present; 6 or 11 columns; `XXXXX` (5) vs `XXXXXX` (6) placeholders; 106th grid has 6- then 5-column blocks |
| Rs750 105th PDF | Scanned image PDF (signatures); `******` placeholders; header table has `300,192 Prizes` (comma trap) |
| Rs750 108th | Second prize contains **`7447`** (4 digits, probably `007447`) → suspect token |
| Rs200 (all) | **5 second prizes** on one line; vertical one-per-line list in 97th; `1st Prize` / `2nd Prize` ordinal headings (105th); `Draw Result of Prize Bond Rs 200 Denomination 101st Draw` (no `/-`); `…bond 102 Draw` (no ordinal suffix); 107th uses labels `01 Prize:<tab>516806`, `05 Prizes<tab>381066…`; header says "PREMIUM"; `(2400 Prizes…)` declares total; 97th has a long legal preamble including prose "…the second prize will get the second prize…" and per-series totals (`395,010 Prizes…`) |
| Rs100 (50th, 51st, 53rd, 54th) | `Student Welfare Prize Bonds`; 50th `Third prize Rs.1,000/- each`; 51st/53rd no third heading but `(1199 Prizes…)`; 54th `Third Prize of Rs.100/- each` (typo); 12 or 6 columns, 2-column tail block; `xxxxxx` placeholders |
| Rs1500 (101st, 105th) | **5-column grids**; `Third Prize 1696 Prizes of Rs.18,500/- Each}` (stray brace); quoted header lines; `XXXXX` |
| Rs25,000 (13th–23rd) | **Two first prizes** on one line; `Rs.25,000/-DENOMINATION` (glued) / `Rs.25000/- Denomination`; `-22nd  DRAW`; `Draw No. 13th`; `Third Prize of Rs. Rs. 300,000`; 4/6/13-column grids; `******`/`xxxxxx`; 23rd uses `02 Prizes<tab>…` labels and `HELD ON 10-09-2026 AT SBP BSC QUETTA` |
| Rs40,000 (24th–38th) | `Rs. 40, 000/-` (space after comma); `40,000 Prize Denomination` (no "Rs"); `Third Price` (typo); `Third Prizes of`; one file has **no draw number at all**; `01 Prize        308105`; `(660 Prizes)` inside a heading; ` - 660 PRIZES OF Rs.500,000/- EACH` declared in prose; trailing whitespace after second-prize numbers; 3-column tail block |
| Any | Excel-like loss of leading zeros if someone re-saves in Excel; HTML error pages saved as `.txt`; BOM; UTF-16; CRLF |

### 5.2 The traps (each one has caused or would cause a silent wrong result)
1. **Header numbers**: `000001 to 999999`, `300,192`, `1,500,000` must never be parsed as winners. Rule: numbers count only **after a tier heading**, and only on lines made *exclusively* of digit tokens/placeholders. **Never strip commas first** (`300,192` → `300192`).
2. **Missing third-prize heading** → third tier is entered by **count**: once all second-prize numbers are collected, everything after is third.
3. **Rs200 has five second prizes** and Rs1500 grids have five columns → any "grid row has ≥N columns" rule is wrong. Use counts from the prize structure.
4. **Short numbers** (`7447`) are never silently accepted or dropped → `suspect` (candidate `007447`), draw ⇒ `needs_review`, but a bond with the candidate number gets a *provisional* "possible win".
5. **Placeholders** (`XXXXX`, `XXXXXX`, `xxxxxx`, `******`) pad the last grid column; ignore them (count them for diagnostics).
6. **Prose that looks like headings**: headings must **start the line** (`^\W*(first|1st)\s+pri[zc]es?`…), else the 97th preamble flips tiers early.
7. **Labels before numbers** (`01 Prize:<tab>516806`, `05 Prizes …`) → strip the label prefix, then require the rest to be digits.
8. **Encoding**: decode UTF-8 first (fallback cp1252, honour BOMs/UTF-16). `â€“` in headers means someone decoded UTF-8 as cp1252.
9. **Header lies**: wrong denomination/typos in prize amounts → trust list-page metadata and our config.
10. **Excel**: numeric cells lose leading zeros (`000381` → `381`). When reading `.xlsx`, read cells as **text**; if a numeric cell with <6 digits appears, left-pad **and** mark the value `padded_from_numeric` → draw is `needs_review` unless the count validates *and* there are no duplicates.
11. **Revised files**: filenames like `Revised-Draw-Result-of-Rs.-200…` (Rs200 Dec 2025). Treat as a *newer version* of that date (see §5.4).
12. **Incomplete files**: `.doc` named `First-Page-…`; any file whose counts fail → never ingest as `ok`.

### 5.3 File-type handling and priority
Priority: **txt → xlsx/xls → pdf (text layer) → pdf (OCR) → doc/docx**. The user wants: *check text first; if text is there, great; if Excel/PDF also exist, say so and verify if possible.*

| Kind | How to read | Notes |
|---|---|---|
| `.txt` | `decodeBytes()` → `parseDrawText()` | Primary. Reference parser exists. |
| `.xlsx/.xls` | Library (e.g. SheetJS) reading every sheet as text; join cells of a row with `\t` → same `parseDrawText()` | **Not yet written.** Preserve strings; check for numeric cells (trap #10). Measure CPU (2 s limit per request on Edge Functions) — if too slow, process in the GitHub Actions worker. |
| `.pdf` with text layer | `pdf.js`/`unpdf`/`pdftotext -layout` → text → parser | Layout may reflow columns; the parser is column-agnostic. |
| `.pdf` scan (image) | OCR (Tesseract, 300 dpi, `--psm 6`, digit whitelist) | **Cannot run in Edge Functions.** Mark `needs_ocr`; processed by the optional GitHub Actions OCR worker (§19 Phase 8) or by manual upload. Never auto-approve OCR output unless counts validate AND no duplicates; also run `nearMisses()` (distance-1) against the bonds and flag. Examples that are scans: Rs750 105th PDF, `CamScanner-10-03-2026….pdf` (Rs40000). |
| `.doc/.docx` | Last resort | `First-Page-…` doc is probably incomplete. Mark `incomplete` unless counts validate. |

### 5.4 Selecting the accepted file for a `(denomination, date)`
```
candidates = all links for that date, ordered: txt, xlsx, xls, pdf, docx, doc
if any candidate looks revised (label/filename contains "revised"/"updated"/"corrected"): prefer revised over original *within the same kind*.
for c in candidates:
    result = fetch + parse + validate(c)
    if result.ok:
        accepted = c; break
if none ok:
    best = candidate with fewest issues (kept for provisional matching)
    draw.status = 'needs_review' (or 'failed' if nothing parsed / only unreadable kinds)
# Cross-check (optional, cheap when the file is already downloaded):
for other in remaining candidates of a different kind that parse ok:
    compare number sets; if different -> draw.status='needs_review', record diff
# Two *different* ok files for the same kind (original vs revised):
    prefer the revised one, keep the original as superseded, store diff, notify, re-run matching
```
Always store which candidate was accepted and why (`draw.accepted_file_id`, `draw.decision_note`).

### 5.5 Draw statuses
`pending` → `ok` | `ok_manual` (human-confirmed) | `needs_review` (parsed but failed validation; provisional matching still runs) | `needs_ocr` | `incomplete` | `failed` (nothing usable) | `superseded` (older version replaced).
The UI computes `verified = count(status in ('ok','ok_manual'))` and shows the rest explicitly.

---

## 6. Parser specification (reference implementation delivered)

Reference: `prizebond-parser.mjs` (plain ES module, dependency-free → usable unchanged in Deno/Supabase Edge, Node, React Native). Tests: `test-rs100-200-750-1500.mjs`, `test-premium-25000-40000.mjs`. **Port/import it as-is into `supabase/functions/_shared/` and keep the tests green.** Behaviour to preserve:

1. `decodeBytes(bytes)` — BOM aware; UTF-8 first, cp1252 fallback.
2. `parseDrawText(text, {denomination, drawNo, expected, listDate})`
   - Header meta from the first 15 lines: draw number (`107th DRAW`, `Draw No:98th`, `102 Draw`), denomination (`Rs.25,000/-DENOMINATION`, `Rs. 40, 000/-`, `40,000 Prize Denomination`, `Rs.750/- PRIZE BOND`), held date (`HELD ON dd-mm-yyyy`, `Date:dd/mm/yyyy`, `on 16.03.2026`).
   - Option values from the list page **override** header values; disagreement ⇒ warning. `listDate` vs file date mismatch ⇒ warning.
   - State machine over lines: tier headings (anchored), label stripping, **data line = only digit tokens/placeholders**, tier switch by count (fallback: grid-row heuristic only if structure unknown), tokens: 6-digit ⇒ number; ≤3 digits ⇒ ignored noise (page numbers); 4–5 or ≥7 digits ⇒ `suspect` (4–5 digit ones carry `candidate = padStart(6,'0')`).
   - `declaredThird` from `(NNN Prizes of…)`, `(NNN Prizes)`, ` - NNN PRIZES OF`, value ≤ 5000.
3. `validate(parsed)` → `{ok, issues[], warnings[]}`: per-tier counts vs structure; duplicates across tiers; any suspect ⇒ issue; unknown structure ⇒ issue; third count unknown ⇒ warning only; declared≠config (and ≠ total) ⇒ warning.
4. `buildIndex`, `matchBonds(bonds, index, parsed)` → `{wins, possible}`; `nearMisses(bonds, numbers)` for OCR.
5. Known limitation to fix in the port: `PRIZE_STRUCTURE` is hard-coded in code → in production load it from the `prize_structures` table (§10) and pass `expected` into `parseDrawText`.

**Acceptance:** all existing tests pass; `check-corpus.mjs` over the Appendix A URL list reports every txt as `ok` except genuinely broken files (expected: Rs750 108th = `REVIEW` because of `7447`). Anything else flagged must be investigated and either fixed in the parser (+ new test) or documented as a data problem.

---

## 7. Matching specification

1. **Key:** `(denomination, number)`. Series is stored optionally for display, never used for matching. Two bonds with the same number and different series both win.
2. **Where:** in SQL (single set-based statement), never in the client. Run (a) when a draw becomes `ok`/`ok_manual`/`needs_review`, (b) when a bond is added/edited (against **all** stored draws of its denomination), (c) when a draw file is superseded/corrected (delete that draw's old wins, recompute).
3. **Provisional wins:** parsed suspects with a candidate (e.g. `007447`) are inserted into `draw_numbers` with `provisional=true`; matches against them create `wins.provisional=true` shown as "Possible win — verify on official site".
4. **No purchase-date filter.** A bond is checked against every historical draw even if added "now": a bond that won earlier and is unclaimed is still valuable. (Claim deadlines are **not known** → show a neutral note "claim rules: confirm on National Savings".) `purchased_on` is informational only.
5. **Bulk bonds / ranges:** the UI may accept a range (`122000–122099`) and expand it to rows; matching itself stays per-number.
6. **Result of a check:** write one `draw_checks` row per `(draw, run)` with `bonds_checked`, `wins`, `possible`, `file_id`; the UI can then say "108th draw (Rs750): 1700/1700 numbers verified, 214 bonds checked, 0 wins".
7. **Mismatched bonds:** official notices say bonds with mismatched series/number printing are not eligible. Show a static disclaimer next to a win; do not try to decide eligibility.
8. **Official-search confirmation (optional):** for every non-provisional win, query `results.php` (§3.3); display "Confirmed on official search" or "Official search disagrees — check manually".

---

## 8. Architecture

```
                        (every few hours / daily)
 GitHub Actions cron ──────────────┐                   pg_cron (inside Postgres)
 (external scheduler + keep-alive) │                          │
                                   ▼                          ▼
                         ┌──────────────────────────────────────────────┐
                         │ Supabase Edge Functions (Deno)               │
                         │  discover  worker  heartbeat  upload-draw-   │
                         │  file  approve-draw  (official-search-check) │
                         └───────┬───────────────┬──────────────────────┘
                 fetch list pages│               │ SQL (service role)
                 + result files  ▼               ▼
              ┌───────────────────────┐   ┌─────────────────────────────┐
              │ savings.gov.pk        │   │ Postgres: bonds, draws,     │
              │ (txt/xlsx/pdf/doc)    │   │ draw_files, draw_numbers,   │
              └───────────────────────┘   │ draw_checks, wins, jobs …   │
                                          └───────────┬─────────────────┘
                                          Storage (private): raw files │ RLS
                                                      ▼
                                       ┌──────────────────────────────┐
                                       │ Abbu's app (existing app,    │
                                       │ storage layer swapped to     │
                                       │ Supabase; shows status/wins) │
                                       └──────────────────────────────┘
 Optional: GitHub Actions OCR worker for scanned PDFs (Phase 8)
 Fallback fetcher (if savings.gov.pk blocks Supabase IPs): the app/device downloads files and uploads them (§14)
```

Rules of the architecture:
- **All heavy logic server-side** (discover, download, parse, validate, match). The app only reads results and adds bonds.
- **Queue-driven**: `ingest_jobs` table + a `worker` function that claims 1–3 jobs per invocation (`FOR UPDATE SKIP LOCKED`) so each invocation stays far below the free-plan limits (§13).
- **Set-based discovery**: "links on site" minus "draws we have" = work to do. No dependence on calendar dates.
- **Everything idempotent** (unique keys + upserts).

---

## 9. Edge Functions and job flow (contracts)

All functions: TypeScript/Deno, import `_shared/prizebond-parser.mjs`; use the service-role key from function secrets; log structured events to `pipeline_events`.

| Function | Trigger | Auth | Responsibility |
|---|---|---|---|
| `discover` | pg_cron + GitHub Actions + app "check now" | shared-secret header | For each active `sources` row: fetch list page (conditional GET) → `extractDrawLinks` → upsert `draws` (by denomination+date) and `draw_files` (by url) → enqueue `ingest_draw` jobs for new links, for files whose conditional-GET/hash changed, and for the latest 3 draws per denomination (revision detection). Updates `heartbeat.last_discovery_ok`. |
| `worker` | pg_cron (only when jobs are runnable) + self-chaining + `discover` | shared-secret header | Claims ≤ N jobs; runs them; re-invokes itself if jobs remain (bounded chain). Job kinds below. |
| `heartbeat` | pg_cron + GitHub Actions + app start | shared-secret (cron) / JWT (app) | `UPDATE heartbeat SET last_beat = now()` (a real write) and return status summary. |
| `upload-draw-file` | App (manual upload) | user JWT | Accepts `{denomination, draw_date, filename, bytes}` → stores raw file → enqueues `ingest_draw` with `source='manual'`. Used for PDF/scan/doc fallback and for the "phone-as-fetcher" fallback (§14). |
| `approve-draw` | App review screen | user JWT | Lets the user confirm a suspect value (e.g. `7447` → `007447`) or accept a draw as is → writes `draw_numbers`, sets `status='ok_manual'`, enqueues `match_draw`. Every approval is logged. |
| `official-search-check` (optional) | after wins / weekly audit | secret | §3.3. |

### 9.1 Job kinds (`ingest_jobs.kind`)
1. `ingest_draw {draw_id}`:
   1. Load candidates (`draw_files`) in priority order (§5.4).
   2. For each candidate: download (§9.2) → store raw bytes in Storage + sha256 → convert to text (§5.3) → `parseDrawText(text, {denomination, drawNo: from draw if known, listDate, expected: structure})` → `validate`.
   3. Pick accepted file per §5.4; write `draw_numbers` (replace the set atomically in one transaction), parsed counts/issues/warnings, `status`.
   4. Enqueue `match_draw {draw_id}`.
2. `match_draw {draw_id}`: run the set-based SQL (§10, "Matching SQL"), write `wins`, `draw_checks`.
3. `rematch_bond {bond_id}`: same SQL against all draws of the bond's denomination (triggered by bond insert/update through a DB trigger → job row).
4. `backfill {denomination?}`: enqueue `ingest_draw` for every draw lacking an accepted file (idempotent; the UI shows progress as `done/total`).
5. `reconcile`: recompute `draw_checks`/wins for all draws (used after parser fixes, after restoring a paused project, or after structure-config changes).

### 9.2 Download rules
- Only `https://savings.gov.pk/**` and `https://www.savings.gov.pk/**` (allowlist; follow ≤3 redirects *within* the allowlist).
- Timeout 20 s, max body 5 MB, `User-Agent: PrizeBondChecker/1.0 (personal use)`, 1 request/second, retries with exponential backoff (1 min, 5 min, 30 min, 3 h; max 6 attempts, then `failed` with the last error visible in the UI).
- **Body sanity**: a 200 response whose body starts with `<!DOCTYPE`/`<html` is an error page → treat as failure even if the URL ends in `.txt`.
- Keep `etag`/`last-modified` for conditional re-checks of recent draws.
- Never write partial results: parse in memory, then one DB transaction.

### 9.3 Re-ingestion / corrections
If a file's `sha256` changes (or a "revised" link appears): re-parse; if numbers changed: set old file `superseded`, replace `draw_numbers`, delete old `wins` for that draw, re-match, and create a **"result corrected"** event/notification in the app.

---

## 10. Database schema (PostgreSQL / Supabase)

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 10.1 configuration ---------------------------------------------------------
create table sources (                       -- list pages to crawl
  id int generated always as identity primary key,
  denomination int not null unique,
  list_url text not null,
  is_premium boolean not null default false,
  active boolean not null default true
);

create table prize_structures (              -- counts and amounts per draw range
  id bigint generated always as identity primary key,
  denomination int not null,
  from_draw_no int not null default 0,       -- applies to draws >= this number
  first_count int not null, second_count int not null,
  third_count int,                           -- null = unknown (do not validate)
  first_amount bigint not null, second_amount bigint not null, third_amount bigint not null,
  note text,
  unique (denomination, from_draw_no)
);
insert into prize_structures (denomination, from_draw_no, first_count, second_count, third_count, first_amount, second_amount, third_amount, note) values
 (100,   0, 1, 3, 1696,   700000,   200000,    1000, 'Rs100 draws < 51'),
 (100,  51, 1, 3, 1199,   700000,   200000,    1000, 'Rs100 from the 51st draw'),
 (200,   0, 1, 5, 2394,   750000,   250000,    1250, ''),
 (750,   0, 1, 3, 1696,  1500000,   500000,    9300, ''),
 (1500,  0, 1, 3, 1696,  3000000,  1000000,   18500, ''),
 (25000, 0, 2, 5,  700, 30000000, 10000000,  300000, 'two first prizes'),
 (40000, 0, 1, 3,  660, 80000000, 30000000,  500000, '');

-- 10.2 core data -------------------------------------------------------------
create table bonds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  denomination int not null,
  number char(6) not null check (number ~ '^[0-9]{6}$'),
  series text,                               -- display only, never used for matching
  purchased_on date,                         -- informational only
  note text,
  legacy_id text,                            -- id from the old localStorage data (idempotent migration)
  created_at timestamptz not null default now()
);
create unique index bonds_unique on bonds (owner_id, denomination, coalesce(series, ''), number);
create index bonds_lookup on bonds (denomination, number);

create table draws (
  id uuid primary key default gen_random_uuid(),
  denomination int not null,
  draw_date date not null,                   -- from the list page link text (authoritative)
  draw_no int,                               -- from file header when available
  held_on date,                              -- from file header (cross-check only)
  status text not null default 'pending'
    check (status in ('pending','ok','ok_manual','needs_review','needs_ocr','incomplete','failed','superseded')),
  accepted_file_id uuid,
  decision_note text,
  parsed_counts jsonb, issues jsonb, warnings jsonb,
  first_seen_at timestamptz not null default now(),
  ingested_at timestamptz,
  unique (denomination, draw_date)
);

create table draw_files (                    -- every candidate link + raw file
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references draws(id) on delete cascade,
  url text not null unique,
  kind text not null check (kind in ('txt','xlsx','xls','pdf','docx','doc','manual')),
  label text,
  is_revised boolean not null default false,
  sha256 text, storage_path text, bytes int,
  http_status int, etag text, last_modified text, fetched_at timestamptz,
  parse_status text not null default 'pending'
    check (parse_status in ('pending','ok','review','failed','skipped','needs_ocr','superseded')),
  parsed_counts jsonb, issues jsonb, warnings jsonb
);

create table draw_numbers (
  draw_id uuid not null references draws(id) on delete cascade,
  number char(6) not null,
  tier smallint not null check (tier in (1,2,3)),
  provisional boolean not null default false,   -- e.g. 7447 padded to 007447
  primary key (draw_id, number)
);
create index draw_numbers_number on draw_numbers (number);

create table draw_checks (
  id bigint generated always as identity primary key,
  draw_id uuid not null references draws(id) on delete cascade,
  file_id uuid references draw_files(id),
  run_at timestamptz not null default now(),
  bonds_checked int not null, wins int not null, possible int not null
);

create table wins (
  id uuid primary key default gen_random_uuid(),
  bond_id uuid not null references bonds(id) on delete cascade,
  draw_id uuid not null references draws(id) on delete cascade,
  tier smallint not null,
  prize_amount bigint,
  provisional boolean not null default false,
  confirmed_by_official_search boolean,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  unique (bond_id, draw_id)
);

-- 10.3 operations ------------------------------------------------------------
create table ingest_jobs (
  id bigint generated always as identity primary key,
  kind text not null,                        -- ingest_draw | match_draw | rematch_bond | backfill | reconcile
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create unique index ingest_jobs_dedupe on ingest_jobs (kind, (payload::text)) where status in ('queued','running');

create table pipeline_events (               -- audit trail
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  level text not null, kind text not null,
  draw_id uuid, message text, data jsonb
);

create table heartbeat (
  id int primary key default 1 check (id = 1),
  last_beat timestamptz, last_discovery_ok timestamptz, last_ingest_ok timestamptz
);
insert into heartbeat (id) values (1);
```

### 10.1 Matching SQL (one statement per draw)
```sql
insert into wins (bond_id, draw_id, tier, prize_amount, provisional)
select b.id, d.id, n.tier,
       case n.tier when 1 then ps.first_amount when 2 then ps.second_amount else ps.third_amount end,
       n.provisional
from draws d
join draw_numbers n on n.draw_id = d.id
join bonds b on b.denomination = d.denomination and b.number = n.number
join lateral (select * from prize_structures p
              where p.denomination = d.denomination and p.from_draw_no <= coalesce(d.draw_no, 2147483647)
              order by p.from_draw_no desc limit 1) ps on true
where d.id = :draw_id
on conflict (bond_id, draw_id) do update
  set tier = excluded.tier, prize_amount = excluded.prize_amount, provisional = excluded.provisional;
```
Run `delete from wins where draw_id = :draw_id` first when a draw's numbers were replaced. `rematch_bond` uses the same join with `b.id = :bond_id` across all draws of that denomination whose status is in (`ok`,`ok_manual`,`needs_review`).

### 10.2 RLS (single user, but still enforced)
- `bonds`, `wins`: `owner`-only policies (`owner_id = auth.uid()`; for `wins` via join to bonds).
- `draws`, `draw_files`, `draw_numbers`, `draw_checks`, `prize_structures`, `sources`, `heartbeat`: `select` for `authenticated`; **no** insert/update/delete policies (only the service role writes).
- `pipeline_events`, `ingest_jobs`: no client access (or read-only for the owner's status screen via a view).
- Create the single auth user manually, then **disable public sign-ups**.
- Trigger on `bonds` insert/update (number/denomination) → insert `rematch_bond` job.

---

## 11. Scheduling and polling policy

| Job | Schedule | Notes |
|---|---|---|
| `discover` | **daily** at a fixed hour (e.g. 06:00 PKT) all year; **every 2 hours between the 9th and 22nd of each month**; **hourly on days 10–11 and 15–17** (when draws are published) | Calendar only controls *intensity*; discovery is set-based so a missed run loses nothing. |
| `worker` | every 5 minutes **only if** runnable jobs exist (cron SQL checks `ingest_jobs` first, then `net.http_post`) + self-chaining | Keeps invocation count far below the 500k/month free limit. |
| revision check | daily: conditional GET of the latest 3 draw files per denomination | Detects corrected/"revised" files for ~30 days after publication. |
| `heartbeat` | pg_cron daily **and** GitHub Actions every 2–3 days (§13) | Real DB write. |
| watchdog (SQL) | daily | If `last_discovery_ok` older than 3 days → event `error` + app banner. If a denomination's expected window ended ≥4 days ago and no new draw appeared → soft warning "no new draw published yet?" (a delayed draw is normal; this is **not** an error). |
| weekly audit (optional) | weekly | 5 random bonds vs official search (§3.3). |

All cron schedules are UTC in pg_cron; convert from PKT (UTC+5, no DST).
Store function URLs and the shared secret in **Supabase Vault**; cron SQL reads them from Vault.

---

## 12. Security

1. The service-role key lives **only** in Edge Function secrets/CI secrets. Never in the app bundle, never in the repo.
2. App uses the anon key + user session; RLS enforced everywhere.
3. Cron-invoked functions require a long random shared secret header (`x-cron-secret`); user-invoked functions verify the JWT.
4. SSRF/abuse: strict URL allowlist (§9.2), size cap, redirect cap, no user-supplied URLs except through `sources` (editable only by the service role / owner via SQL).
5. Storage bucket for raw files is **private**; signed URLs only if the UI needs "open stored copy".
6. No secrets in logs; `pipeline_events.data` must not contain keys.
7. Backups: weekly export of `bonds` to a JSON file in Storage + the in-app "Export backup" button (the owner can also use Supabase's own backups if available on the plan — VERIFY; free plans may not include them).
8. Disable email sign-up; if email confirmation is used, make sure the single account is confirmed.

---

## 13. Supabase free plan: limits and the **pause problem**

### 13.1 Limits that shape the design (VERIFY again at implementation time)
- Free plan (as of Oct 2026): ~500 MB database, ~1 GB file storage, ~500,000 Edge Function invocations/month.
- Edge Functions: wall-clock **150 s** on Free (400 s on paid), **CPU time 2 s per request** (async I/O such as waiting for downloads does not count), memory **256 MB**, request idle timeout **150 s** (504 if no response), outgoing ports 25/587 blocked, function bundle size limit (docs conflicting: 2/10/20 MB → keep the bundle small).
- Consequences: process **1–3 draws per invocation**; keep the parser lean; measure xlsx/pdf libraries' CPU; push heavy work (OCR, big PDF parsing) to the GitHub Actions worker.
- Data volume estimate: ~190 draws since 2019 × ~1,700–2,400 numbers ≈ 350k rows (< ~50 MB with indexes); raw files ≈ 100–300 KB each (< ~60 MB). Comfortably free. (Estimate; measure after backfill.)

### 13.2 The pause problem
- **Fact:** free projects are **paused after 7 days of inactivity**. Data is kept; the project can be restored from the dashboard. A paused project's database is offline, so **`pg_cron` stops too and cannot wake it**. "Activity" means real database activity (queries/writes). Community reports say jobs inside Postgres count, but this is not an official guarantee → **do not rely on in-DB cron alone**.
- **Layered defence (all free):**
  1. **L1 – in-DB**: `pg_cron` daily job writes `heartbeat.last_beat`.
  2. **L2 – external scheduler (primary keep-alive)**: a **GitHub Actions** workflow (`on: schedule`, e.g. Mon & Thu 07:00 UTC + `workflow_dispatch`) that calls the `heartbeat` function (and `discover`) with the shared-secret header. Make the workflow **fail loudly** if the response is not 2xx so GitHub's failure notification reaches the owner. Caveats to VERIFY: scheduled workflows can be delayed/skipped under load; in **public** repos they are auto-disabled after ~60 days without repo activity (use a private repo or add a periodic no-op commit); check the free-minutes quota for private repos. Alternative: a free external cron service (check its terms).
  3. **L3 – the app**: calling `heartbeat` on app start (abbu opening the app counts).
  4. **L4 – detection in the app**: if the Supabase endpoint is unreachable/returns the "paused" error, show a clear banner: *"Server paused/unreachable — owner must open the Supabase dashboard and press Restore."* Also show `heartbeat.last_beat` age in Settings.
  5. **L5 – catch-up**: after any outage or restore, run `discover` + `reconcile`. Because discovery is set-based and ingestion idempotent, **no draw is missed** by an outage — it is only delayed.
  6. **L6 – last resort**: Supabase Pro (≈$25/month) removes pausing. Only with the user's approval.
- **Acceptance test:** simulate a 10-day gap (disable the schedulers locally/staging) → after re-enabling, one `discover` run must enqueue and complete every missing draw with no manual action beyond restore.

---

## 14. Phase 0: connectivity spike and fallback fetchers (do this FIRST)

Unknown: can Supabase Edge (foreign IPs) reach `savings.gov.pk`? Some `.gov.pk` hosts block or throttle foreign traffic.

**Spike deliverable:** a throwaway Edge Function that, from Supabase, fetches (a) `https://savings.gov.pk/rs-750-prize-bond-draw/`, (b) one `.txt` result file, (c) one `.pdf`; returns status, latency, content-type, first 200 bytes. Run it ~10 times over a day (different times). Write the findings into `docs/PHASE0_REPORT.md`.

**Decision matrix:**
| Result | Architecture |
|---|---|
| Reliable from Supabase | **A**: server-side fetching as designed. |
| Blocked / timeouts / captcha | **B**: *device as fetcher*: the app (Pakistani IP) reads the list pages, downloads new files, and uploads the raw bytes to `upload-draw-file`; the server still parses/validates/matches. Automatic whenever abbu opens the app; weaker than A, so also: show "last device sync" and prompt if > N days. For a **web** app, browser CORS will likely block direct fetches from `savings.gov.pk` → B requires a native app (React Native has no CORS) or a tiny proxy. |
| Partly (list ok, files blocked, or vice-versa) | Hybrid per resource. |
Also test whether GitHub Actions runners can fetch (they are also foreign IPs; most likely same as Supabase).
(Option C, not free: an always-on Pakistani VPS/home machine as fetcher — mention to the user only if A and B both fail.)

---

## 15. App changes (existing app → Supabase)

> The app already exists and stores everything in `localStorage`. **Step 0: inspect the repo** (framework — React web / React Native / other is unknown to this spec; data shapes; existing screens; language of UI copy) and write `docs/APP_AUDIT.md` before changing anything.

### 15.1 Storage layer
Introduce a `BondRepository` interface (list/add/update/remove bonds, bulk add, export). Implement `LocalStorageRepo` (existing behaviour) and `SupabaseRepo`. Switch via config; remove `localStorage` as the system of record only after migration is verified.

### 15.2 One-time migration (idempotent)
1. Settings → "Upload old data": reads `localStorage`, shows a preview (count by denomination, invalid rows).
2. **Create a downloadable JSON backup first.**
3. Validate every number (exactly 6 digits; keep leading zeros; denomination required). Rows failing validation are listed and **not** dropped silently.
4. Insert with `legacy_id` (unique) so re-running does not duplicate.
5. Keep the `localStorage` copy for a grace period; remove only on explicit user confirmation.
6. If the old data has no denomination per bond → the UI must ask abbu (bulk-assign) because matching needs it.

### 15.3 Screens (adapt to existing UI)
1. **Home/status**: "Last check", "Draws verified X of Y", unacknowledged wins at the top, banners (server unreachable, stale heartbeat, draws need review).
2. **Add bonds**: single; bulk paste (one number per line / separated by spaces); range (`from–to`); CSV import. Validate 6 digits, require denomination, optional series, detect duplicates, show the list back for confirmation ("N bonds will be added"). Per-denomination totals shown so abbu can compare with his physical bonds.
3. **Bond list**: search by number; per bond: "checked against N draws, wins: …".
4. **Results**: per denomination latest draw + history; for each draw show `verified` badge, numbers count, bonds checked, wins.
5. **Draw status board**: every known draw with status; for `needs_review/failed/needs_ocr/incomplete` show reason + **"Open official file"** link + **"Upload file"** button.
6. **Review**: confirm suspect values (e.g. `7447 → 007447`), accept/decline; each action logged.
7. **Settings**: backup export/import, Supabase connection state, last heartbeat, app/parser version, "Run check now", "Run full backfill".

### 15.4 Copy rules
- Never say "all checked" unless `verified == total` and no job is pending/failing.
- Provisional: "Possible win — please verify on the official site".
- Neutral claim note on every win: "Prize claim rules: confirm with National Savings."
- Match the existing app's language (ASSUMED Roman Urdu/English mix — confirm).

### 15.5 First-run backfill UX
After bonds are added: "Start full check" → progress "34 / 120 draws" (from `ingest_jobs`/`draws`), resumable, safe to close the app.

### 15.6 Notifications
- **v1 (required):** in-app persistent banner for unacknowledged wins + "Result corrected" notices; Home screen summary.
- **v2 (optional, after the core works):** push/email. Options depend on the app stack (e.g. Firebase Cloud Messaging for native apps; email via a free provider). VERIFY current free terms before choosing; do not add paid services.

---

## 16. Observability and audit trail

- `pipeline_events` records: discovery runs (links found/new), each download (status, bytes, sha256), parse results (counts, issues), status changes, approvals, supersessions, matching runs (`draw_checks`), errors.
- A SQL view `v_status` for the Home screen: verified/total draws, last discovery, last ingest, last heartbeat, pending jobs, draws needing attention.
- Retention: keep events 12 months; keep raw files forever (small).
- A dashboard-free "health" page in Settings is enough (single user).

---

## 17. Testing and verification

### 17.1 Unit tests (exist; keep green in CI)
`test-rs100-200-750-1500.mjs`, `test-premium-25000-40000.mjs`. Add a test for every new format discovered.

### 17.2 Corpus test (exists)
`node check-corpus.mjs sources.txt` with the URL list in Appendix A (lines: `<denomination> <url>`). Expected: all `.txt` `ok` except known data problems (e.g. Rs750 108th `7447`). Run it in CI nightly against live URLs (non-blocking) and before each release.

### 17.3 Golden assertions
Appendix B lists first/second prize numbers for many real draws. Automate: after ingesting each draw, assert `draw_numbers` tiers 1 and 2 equal the golden sets and counts equal the structure. (Values were read from files supplied by the user — re-verify against the official site if any assertion fails before "fixing" the parser.)

### 17.4 Integration tests (local `supabase start`)
- Ingest fixture files end-to-end → expected rows and statuses.
- **Idempotency:** run `discover`+`worker` twice → identical row counts.
- **Concurrency:** two workers → no job processed twice (`SKIP LOCKED`).
- **Failure injection:** HTML error page served as `.txt`; truncated file; 404; redirect to another domain (must be rejected); timeout; duplicate links; txt+pdf+xlsx for one date; revised file replacing original (wins recomputed + notification); changed hash.
- **New bond trigger:** insert a bond equal to a historical winner → `wins` row appears without any download.
- **Provisional:** bond `007447` with the 108th fixture → provisional win.
- **RLS:** anon cannot read `bonds`; authenticated owner can; client cannot write `draws`.
- **Migration:** sample `localStorage` JSON (including leading zeros, missing denomination, duplicates, invalid rows) → correct import, nothing dropped silently, re-run adds nothing.
- **Scheduler logic:** table-driven tests of "which cron fires when" and watchdog thresholds with a fake clock.
- **Pause drill:** §13.2 acceptance test.

### 17.5 Manual verification (once)
After the first full backfill: pick 10 random historical draws, compare first/second prizes with the official site; pick 5 random bonds and compare results with `results.php`. Record in `docs/VERIFICATION_LOG.md`.

---

## 18. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Supabase IPs blocked by `savings.gov.pk` | No automatic downloads | Phase 0 spike; architecture B (device fetcher); §14 |
| Free project pauses | Silent stop | §13 layers + visible banners + catch-up |
| Website redesign / link markup change | Discovery returns 0 links | Watchdog: 0 links or sudden drop ⇒ error event + banner; keep `extractDrawLinks` tested against saved HTML snapshots |
| File format changes | Parse fails | Strict validation ⇒ `needs_review`, never silent; add fixture + fix |
| Official file contains an error (e.g. `7447`) | Wrong/missing match | Provisional matches; manual approve flow; optional official-search cross-check |
| Scan-only PDFs | No text | `needs_ocr` → manual upload or OCR worker (optional); near-miss matching |
| Edge CPU limit (2 s) | Timeouts on xlsx/pdf | Measure; move heavy parsing to GitHub Actions worker |
| Wrong denomination entered for a bond | Missed/false wins | Denomination required; totals per denomination shown; confirmation screen |
| Typing errors in bond numbers | Missed wins | Validation, read-back list, duplicate detection, optional camera OCR later |
| Corrected ("revised") results | Stale wins | Hash tracking, supersede + re-match + notice |
| GitHub scheduled workflow disabled/dropped | No keep-alive | pg_cron L1 + app-start heartbeat + failure visibility; periodic check |
| Free-tier terms change | Cost/behaviour change | VERIFY at implementation; Pro as fallback with approval |
| Over-polling the site | Blocking/ToS | Rate limits, conditional GET, caching |

---

## 19. Phased implementation plan (with acceptance criteria)

**Phase 0 — Spike + audit.** `docs/PHASE0_REPORT.md` (connectivity decision A/B/hybrid) and `docs/APP_AUDIT.md` (stack, data shapes, screens, language). *Accept:* both documents exist; the user has agreed on the architecture variant.

**Phase 1 — Database, auth, migration.** Schema (§10), seed `prize_structures` and `sources`, RLS, single user, `SupabaseRepo`, migration tool + backup. *Accept:* app runs fully on Supabase; migration test passes; RLS tests pass; localStorage backup downloadable.

**Phase 2 — Discovery + ingestion (txt only), Rs750 first.** `discover`, `worker`, download rules, raw storage + hash, parser integration, validation, statuses. *Accept:* every Rs750 `.txt` on the site is ingested; golden assertions pass; 108th is `needs_review` with suspect `7447`; HTML-error-page and truncation tests pass. Then enable all six denominations; corpus (Appendix A) results match expectations.

**Phase 3 — Matching, backfill, results UI.** `match_draw`, `rematch_bond` trigger, `backfill`, `draw_checks`, Results + status board + progress UI. *Accept:* adding a bond equal to a historical winner produces a win without downloads; backfill is resumable/idempotent; UI never claims completeness while any draw is unresolved.

**Phase 4 — Scheduling, heartbeat, watchdog, pause playbook.** pg_cron + GitHub Actions + app-start heartbeat; watchdog; banners; `docs/RUNBOOK.md` (how to restore a paused project, rerun catch-up). *Accept:* §13.2 pause drill passes; watchdog fires in tests.

**Phase 5 — Review/manual flows and multi-candidate logic.** `upload-draw-file`, `approve-draw`, revised-file handling, cross-check between kinds, supersede + notice. *Accept:* all failure-injection and revised-file tests pass.

**Phase 6 — Excel and PDF-text parsing.** Libraries chosen with CPU measurement; trap #10 (leading zeros) covered by tests; fall back to GitHub Actions worker if CPU is too high. *Accept:* sample xlsx/pdf fixtures parse to the same numbers as their txt twins (e.g. Rs750 105th txt vs pdf-with-text if available).

**Phase 7 (optional) — Notifications + official-search confirmation + weekly audit.**

**Phase 8 (optional) — OCR worker for scan PDFs** (GitHub Actions + Tesseract; digits whitelist; never auto-approve unless counts validate; near-miss flagging). Targets: Rs750 105th PDF, Rs1500 Aug-2026 PDF-only draw, `CamScanner-…pdf` (Rs40000).

**Definition of Done (whole project):**
- A new draw published on the site appears in the app with status and wins **with no human action** (for txt-published draws).
- Every historical draw on the site is either `ok`/`ok_manual` or listed with a reason on the status board.
- Adding a bond checks it against all history immediately.
- No Excel/manual conversion step exists anywhere in the workflow.
- Runbook + verification log exist; all tests green; zero paid services in use.

---

## 20. Open questions for the user (answer before/during Phase 0)
1. What is the app built with (React web, React Native, other)? Android only / iOS too?
2. Which denominations does abbu actually hold? (Rs7,500/15,000? Rs25,000/40,000 registered bonds — are the owner's details needed?)
3. UI language preference for new screens/messages (Roman Urdu / Urdu / English)?
4. Is a GitHub account/private repo available for the keep-alive workflow?
5. Is a Supabase project already created? Which region?
6. Is v1 in-app notification enough, or is push/email wanted later?
7. Roughly how many bonds will be entered (for UX of bulk entry)?

---

## 21. Decision log (everything agreed in the discussion)
1. Use official `savings.gov.pk` result files; **no Pak Bond app integration**; no manual downloading by the user; no Excel conversion; never open files in Excel.
2. Parse `.txt` **first**; if Excel/PDF also exist, note them and use them for cross-checking when possible; if txt fails validation, fall back to Excel, then PDF, then doc. Tell the user which draw could not be read and give a direct **"open file"** link so he never has to browse the website to find it.
3. Check **all** historical draws on the website (from 2019 where listed; the user said 2020/2021 onward) **once**, then only new draws; a newly added bond is checked against all stored draws.
4. Match on number + denomination only; series letters ignored (one common draw for all series).
5. Single user (abbu). Simple schema/auth. Supabase PostgreSQL; app currently on `localStorage`; add DB + automatic system.
6. Everything free; free-plan pause handled with layered keep-alive (§13); Pro only if unavoidable.
7. "100%" cannot be promised (official files can contain errors, PDFs may be scans, the site can change/go down) — the guarantee is **no silent misses**: explicit statuses, provisional matches, banners, completeness counter.
8. Counts per draw differ by denomination and over time (Rs100 1,696 → 1,199) → config table + file-declared counts as warnings.
9. Rs200 has 5 second prizes; Rs25,000 has 2 first prizes → no column-based heuristics; count-based tier switching.
10. Suspect values (e.g. `7447`) → review + provisional match + approval flow.
11. Revised/duplicate files for one date → prefer revised within kind, compare, flag, re-match, notify.
12. `.doc` "First-Page" files and Rs1500 Aug-2026 PDF-only draw are known problem cases → manual upload/OCR path.
13. Prize amounts come from config, not file text; denomination from the list page, not file headers.
14. Official search (`results.php`) is a cross-check only (the site itself warns of errors/omissions); news sites cross-check first/second prizes only.
15. Parser, tests and corpus checker already exist and are the reference.

---

## 22. Delivered files and appendices

### 22.1 Files delivered with this spec
| File | Purpose |
|---|---|
| `prizebond-parser.mjs` | Reference parser: `extractDrawLinks`, `decodeBytes`, `parseDrawText`, `validate`, `buildIndex`, `matchBonds`, `nearMisses`, `PRIZE_STRUCTURE`/`expectedFor`. Dependency-free ES module. |
| `check-corpus.mjs` | `node check-corpus.mjs sources.txt` → table of every file: draw no., held date, counts first/second/third, placeholders, status, issues. PDFs/doc/xlsx listed as `MANUAL`. |
| `test-rs100-200-750-1500.mjs` | 13+ fixtures reproducing real header/format variants (trimmed bodies). |
| `test-premium-25000-40000.mjs` | Premium bond variants. |
Run: `node test-rs100-200-750-1500.mjs && node test-premium-25000-40000.mjs` (Node ≥ 18).
Note: tests use trimmed fixtures, **not** the full real files; the full real-file verification is `check-corpus.mjs` over live URLs (not yet run by the author — Phase 2 must run it).

### Appendix A — URL corpus supplied by the user (use as `sources.txt`, prefix each line with the denomination)
**Rs100**
1. https://savings.gov.pk/wp-content/uploads/2026/02/Rs-100-53-Draw-16-02-2026-Karachi.pdf
2. https://savings.gov.pk/wp-content/uploads/2026/02/53-Draw-Result-of-Rs.-100-Denominatio.txt
3. https://savings.gov.pk/wp-content/uploads/2026/05/Rs-100-Prize-Bond-Draw-May-2026.txt
4. https://savings.gov.pk/wp-content/uploads/2025/05/Draw-Result-100-50th.txt
5. https://savings.gov.pk/wp-content/uploads/2025/08/DRAW-RESULT-OF-RS.-100-DENOMINATIO.txt

**Rs200**
1. https://savings.gov.pk/wp-content/uploads/2026/03/105th-draw-of-Prize-Bond-Rs.200-d.txt
2. https://savings.gov.pk/wp-content/uploads/2026/06/Rs-200-15-06-2026-106-draw.txt
3. https://savings.gov.pk/wp-content/uploads/2026/09/200_150926.txt
4. https://savings.gov.pk/wp-content/uploads/2025/03/Prize-200-101-draw-17-March.txt
5. https://savings.gov.pk/wp-content/uploads/2025/12/Revised-Draw-Result-of-Rs.-200-Denominatio.txt  *(revised file; content not seen by the author)*
6. https://savings.gov.pk/wp-content/uploads/2025/09/DRAW-RESULT-OF-Rs.200-DENOMINATION.txt
7. https://savings.gov.pk/wp-content/uploads/2024/11/Complete-200-list-15-3-2024.txt
8. https://savings.gov.pk/wp-content/uploads/2024/11/20-06-2024-Rs-200-1-5.txt

**Rs750**
1. https://savings.gov.pk/wp-content/uploads/2026/01/DRAW-RESULT-OF-RS.-750-DENOMINATION-105.txt
2. https://savings.gov.pk/wp-content/uploads/2026/01/Draw-Result-105th-draw-of-Rs.-750-denomination.pdf  *(scan; txt twin exists)*
3. https://savings.gov.pk/wp-content/uploads/2026/04/DRAW-RESULT-OF-Rs.750-DENOMINATION.txt
4. https://savings.gov.pk/wp-content/uploads/2026/07/Rs-750-107-draw.txt
5. https://savings.gov.pk/wp-content/uploads/2025/01/Rs-750-101Draw.txt
6. https://savings.gov.pk/wp-content/uploads/2025/04/750-Draw-15-4-2025.txt
7. https://savings.gov.pk/wp-content/uploads/2024/11/15-04-2024-Rs-750.txt
8. https://savings.gov.pk/wp-content/uploads/2024/11/15-07-2024-Rs-750.txt
9. https://savings.gov.pk/wp-content/uploads/2026/10/750_15102026-1.txt  *(108th, Oct 2026)*

**Rs1500**
1. https://savings.gov.pk/wp-content/uploads/2026/02/105-DRAW-RESULT-OF-RS.1500-DENOMINATIO.txt
2. https://savings.gov.pk/wp-content/uploads/2026/02/Rs-1500-105-Draw.pdf
3. https://savings.gov.pk/wp-content/uploads/2026/05/DRAW-RESULT-OF-RS.1500-DENOMINATIO.txt
4. https://savings.gov.pk/wp-content/uploads/2026/08/1500_17082026.pdf  **(PDF only — OCR/manual case; content not provided)**
5. https://savings.gov.pk/wp-content/uploads/2025/02/1500-101-Updated-Draw-List.txt  *(an "Updated" list — a revised-file case)*
6. The 101st draw text (held 17-02-2025, Multan) was pasted by the user without a URL.

**Rs25,000 premium**
1. https://savings.gov.pk/wp-content/uploads/2026/03/Draw-Result-21st-Draw-of-Rs.25000-Premium-Prize-Bond-held-on-10-03-2026-at-SBP-BSC-Multan.pdf
2. https://savings.gov.pk/wp-content/uploads/2026/03/March-DRAW-RESULT-OF-Rs.25000-DENOMINATI.txt
3. https://savings.gov.pk/wp-content/uploads/2026/06/10-06-2026-Rs-25000.txt
4. https://savings.gov.pk/wp-content/uploads/2026/09/25000_100926-1.txt
5. https://savings.gov.pk/wp-content/uploads/2025/03/DRAW-RESULT-OF-17-RS.25000-DENOMINAT.txt
6. https://savings.gov.pk/wp-content/uploads/2024/11/11-3-2024-Rs-25000-Premium.txt

**Rs40,000 premium**
1. https://savings.gov.pk/wp-content/uploads/2026/03/March-DRAW-RESULT-OF-RS.-40000-DENOMINA.txt
2. https://savings.gov.pk/wp-content/uploads/2026/03/CamScanner-10-03-2026-16.21.pdf  *(scan)*
3. https://savings.gov.pk/wp-content/uploads/2026/06/10-06-2026-Rs.40000.txt
4. https://savings.gov.pk/wp-content/uploads/2026/09/40000_100926.txt
5. https://savings.gov.pk/wp-content/uploads/2025/03/32-draw-rs-40000-Premium.txt
6. https://savings.gov.pk/wp-content/uploads/2025/06/Draw-Result-of-33-Rs.-40-000-Denomin.txt
7. https://savings.gov.pk/wp-content/uploads/2024/11/11-03-2024-Rs-40000-Premium.txt
8. https://savings.gov.pk/wp-content/uploads/2024/11/10-06-2024-Rs-40000-Premium-3.txt
9. https://savings.gov.pk/wp-content/uploads/2024/11/10-03-2023-Rs-40000-Premium.txt

(The earlier-quoted Rs750 list page also links older draws back to 2019; the production crawler must discover them itself.)

### Appendix B — Golden first/second prize numbers (read from the files the user supplied)
Format: `draw → first | second`. A leading-zero number is a string. "?" = draw number/date not printed in the file.

**Rs750:** 98th (15-04-2024) `900286 | 134617, 197462, 314256` · 99th (15-07-2024) `827399 | 462355, 565416, 900097` · 101st `271541 | 317904, 496553, 800663` · 102nd `261227 | 204763, 413549, 992747` · 105th (15-01-2026) `809258 | 488890, 748328, 746418` · 106th `560977 | 012592, 152138, 924818` · 107th `976106 | 350211, 604285, 607262` · 108th (15-10-2026) `347425 | 7447 (printed; probably 007447 — unconfirmed), 827353, 876615`.

**Rs200:** 97th (15-03-2024) `612132 | 007796, 018511, 272618, 312188, 637049` · 98th (20-06-2024) `605238 | 272785, 288053, 542096, 966178, 985324` · 101st `597355 | 174102, 433277, 678705, 692458, 839404` · 102nd `774331 | 097127, 265610, 464840, 976082, 978550` · 103rd `401981 | 043052, 529272, 612161, 825972, 896794` · 105th (16-03-2026) `591284 | 293000, 811470, 721418, 473127, 659859` · 106th `581381 | 070148, 194865, 222052, 412303, 710633` · 107th (15-09-2026) `516806 | 381066, 425087, 796229, 799273, 844138`.

**Rs100:** 50th `268813 | 009914, 298412, 886501` · 51st `991149 | 008228, 397667, 951818` · 53rd (16-02-2026) `124915 | 017336, 505165, 971442` · 54th `847006 | 134391, 186306, 821652`.

**Rs1500:** 101st (17-02-2025) `402432 | 543452, 764165, 814653` · 105th `429148 | 430347, 591133, 628300`.

**Rs25,000 (two first prizes):** 13th (11-03-2024) `813800, 911345 | 128816, 364387, 531920, 611029, 705104` · 17th `862446, 887434 | 248068, 493905, 747331, 866955, 919237` · 21st (10-03-2026) `163294, 976291 | 124760, 396147, 669484, 784591, 846050` · 22nd `009663, 845124 | 187375, 216012, 583887, 747225, 763842` · 23rd (10-09-2026) `151975, 154149 | 322522, 428227, 504842, 579060, 647138`.

**Rs40,000:** 24th (10-03-2023) `294617 | 577197, 709992, 979874` · 28th (11-03-2024) `345067 | 181666, 580072, 642104` · 29th (10-06-2024) `946132 | 376410, 632213, 691732` · 32nd `302855 | 018062, 171277, 553311` · 33rd `542389 | 503021, 747213, 812847` · 36th `367558 | 463623, 676830, 855627` · "no draw number printed" (likely Jun 2026 — confirm via the list page date) `810678 | 159467, 855955, 954286` · 38th (10-09-2026) `308105 | 222525, 282397, 765216`.

Cross-checks already seen: the Rs750 107th first prize (976106) and the Rs200 101st first/second prizes match published news coverage.

### Appendix C — Quick start for Claude Code
1. Read this file, then inspect the app repo and write `docs/APP_AUDIT.md`.
2. Copy `prizebond-parser.mjs` to `supabase/functions/_shared/`, run the two test files.
3. Do Phase 0 (spike) and report to the user before building Phases 1–4.
4. Never put the service-role key in the app; never convert files through Excel; never mark a draw `ok` unless validation passes.
