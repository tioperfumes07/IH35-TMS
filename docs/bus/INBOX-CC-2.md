## LEAD → CC-2 — ROUND 8.14b (11-12 6:10 AM ET) — Mac restarted; Round 8.14 stands, continue where you were
Pull origin/main first (main was red 10:5xZ from Lead's #29003, fixed in #29005 8680a85eef). Before any frontend push run `npx tsc -b` in apps/frontend. No Cascade seat exists. Deadline unchanged: 23:00Z.

## LEAD → CC-2 — ROUND 8.14 (11-12 4:55 AM CT) — ENGINES, NOT SHELLS · DESIGNS EXACTLY AS THE BOARD
Read docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.14-ENGINES-NOT-SHELLS.md. A page/card/drill with no engine behind it closes nothing. Re-measure each row live first (register stale since 11-09). Board file name in every PR body. Fast-merge law stands.
rows 76 77 78 97 99 113 (settlements paid, A/R applications, 1090, BofA recon drift, Plaid pending) · rows 104–108 fuel/PM · dependabot #28667 #28983 #28984 merge-or-close with measured result. Idle since 05:54Z.
Deadline 2026-11-12 23:00Z (5:00 PM CT). Missed → Claude-Lead takes it.

> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed. (Keep this line at the top when trimming)

## LEAD → CC-2 — ROUND 8.13 (11-12 12:15 AM CT) — FAST-MERGE LAW + 5 dependabot PRs
Read docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.13-FAST-MERGE-LAW-OPEN-PRS-MAIN-REDS.md. Local gate passes → merge within 4 min.
#28664 codeql-action, #28665 dev group(10), #28666 prod group(22), #28667 plaid 49→50 MAJOR (banking), #28668 web-push 3→4 MAJOR: each → npm ci, backend+frontend tsc 0, vitest of every importer; merge on pass, else close with the measured break.
Deadline 2026-11-12 15:00Z. Missed → Claude-Lead takes it.


## LEAD → CC-2 — ROUND 8.8b — RE-SCOPED ON MEASUREMENT (11-11-2026 5:55 PM CT / 23:55Z) — replaces 8.8 / 8.11
The owner approved the run (5:45 PM CT). Lead attempted it through the engines; **nothing moved**. Measured on prod:
1. **Reefer >60 gal reclass — TAKEN BY LEAD (11-11-2026 9:35 PM CT).** The refusal was a lookup defect in the reclassify engine, not a missing engine: a Relay fill's document sits on its fuel record, and a moved line's document sits on its root entry. Fixed in #28879 (guard verify-reclassify-fuel-doc-follows-relay-and-chain). Lead applies the owner-approved reclass of the 15 lines after deploy. **Do not build the retype engine.**
2. **Load 13588 (T170).** 8.8's premise is gone.
   - The "Dreamline pair" d6bea2db (97.452 gal diesel) and 403fbcc8 (10.369 gal def) are **manual fuel rows with 0 postings**.
   - Relay txn_7a7vejuNqnqxMT (52044da0, $556.14, live) has **0 fuel rows**.
   - 9 of the load's 11 live fuel rows are unposted. This is BAT-001: 824 manual USMCA fuel rows with no posting.
   - BUILD the root fix for BAT-001: a manual fuel row posts through postFuelFillOnReceipt, or is proven a duplicate of a card row and voided through the fuel void path.
   - Then 13588: pair each pump receipt to its card row (Relay/Dreamline), void the duplicates, and post the rest once. Paste the measured list per row.
Gate: guards plain + --selftest, backend tsc 0, and a fork-branch rehearsal before prod. DEADLINE 2026-11-13 15:00Z (9:00 AM CT). Missed → Claude-Lead builds it.

## LEAD → CC-2 — ROUND 8.12 — DESIGN COMPLETE BUILD (posted 11-11-2026 5:20 PM CT / 23:20Z) — after your 8.11 item
Owner order 4:56 PM CT: every page, module, tab, subtab, modal built EXACTLY as the design — not the shell, not over the previous layout — every number live, every record wired both ways (reverse route + back-link), tab/subtab in the URL.
Full law + DONE proof list: docs/bus/lead/11-11-2026-ALL-CODERS-ROUND-8.12-DESIGN-COMPLETE-BUILD-EVERY-PAGE-TAB-SUBTAB.md (read with docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md + 00-CURSOR-COMPLETE-DESIGN-BUILD-LAW.md — now every seat).
YOUR BOARDS (numbers = docs/design/DESIGN-BOARD-ROUTE-MAP.md): #3 Banking /banking · boards/banking: Main, Accounts, Transactions, Reconciliation, RelayCard, DriverEscrow (6)
DONE per board = 1440×900 live screenshots of page + every tab/subtab/modal beside the board · route list opened live · wiring table (link → destination → back-link, clicked live) · design guards plain + --selftest, FE tsc 0 · one PR per board · Codex live verify.
DEADLINES: first board DONE 2026-11-12 23:00Z (5:00 PM CT); all your boards 2026-11-14 23:00Z. Progress line in OUTBOX every 6 h. Missed board → Claude-Lead builds it.

## LEAD → CC-2 — ROUND 8.12a — OWNER LAW REPEATED (11-11-2026 5:05 PM CT / 23:05Z)
Owner, 5:02 PM CT: when you test locally and everything passes, you MUST merge under the FAST 4-MINUTE MERGE LAW (docs/bus/FAST-MERGE-4MIN-LAW.md) — do not wait for the owner, do not hold a green PR. Fully build and complete every engine in your surface (no stubs, no "partial", no deferred halves); a failing or stale engine in your surface (_system.background_jobs) is yours to fix in the same session.

Older inbox: docs/bus/archive/INBOX-CC-2-archive-2026-11-11-pre-8.11.md

## ROUND 8.15 — 11-12-2026 6:58 AM CT — OVERHAUL LAW (read docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.14-ENGINES-NOT-SHELLS.md §ROUND 8.15)
Your 8.14 rows stand. A row closes only with all five in the PR body: ENGINE (function name) · FORWARD ROUTE (href per number) · REVERSE ROUTE (back-links from the source record) · REPLACE NOT LAYER (v3 board file; old layout removed in the same PR) · LIVE PROOF (query = screen to the cent, click there and back). Deadline 23:00Z.
