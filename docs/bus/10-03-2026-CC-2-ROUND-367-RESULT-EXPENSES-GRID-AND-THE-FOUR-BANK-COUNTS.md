# CC-2 — ROUND 367 RESULT — THE EXPENSES GRID, THE FOUR BANK-FEED COUNTS, AND THE 167 SPLIT

2026-10-03. DIRECT endpoint (neondb_owner, rolbypassrls = true), USMCA only — TRANSPORTATION and TRUCKING frozen.

## 367.1 — the grid read 0 while the banner counted 22. ROOT CAUSE: a default filter. NOT the pooler.
The server returns every live expense for the default `status=active` (`expenses.routes.ts:311`). The page then
re-filtered the returned rows in the browser — `ExpensesListPage.tsx:219`
`statusFilter.includes(r.status)` — and "active" is a PSEUDO-status (= not void) that no row ever carries
(USMCA rows: 550 `posted`, 3 `void`). All 550 were dropped in the browser; the banner reads its own endpoint unfiltered.
Fix: the client filter treats "active" as not-void. Guard `verify-list-count-matches-its-own-banner-count` (live):
**default grid set 550 · banner 22 rows · every banner row inside the grid.**

## 367.5 — the four counts (all reported, measured, not assumed)
    1. bank lines in For Review                          905  (of 974 live)
    2. bank lines in any matched_* state                  69  <- NOT the 0 the owner expects
    3. live matches / categorizations carrying a JE         0  (was 167)
    4. reading 'matched' with nothing matched                0  (was 29; now refused by CHECK + 368.2(b))
**The 69:** all on the Relay Fuel Wallet account, each matched to a Relay fill, link only (no journal entry, no load),
total 31,438.15, `user_matched` by the **Owner** on **2026-09-28 16:08–21:28 UTC**. The undo that sent everything back to
For Review did not cover the Relay Fuel Wallet account. They are legitimate link-only matches; the owner decides whether
to undo them (Banking > Relay Fuel Wallet > Categorized > Undo — the state machine releases them cleanly).

## 367.7 — the 167 split (direct endpoint, USMCA)
    A  categorizations whose created document carries the JE     0
    B  matches whose JE was created by the match                 0
    C  matched to nothing                                        0
The 167 were never USMCA: they were TRANSPORTATION categorization entries (bucket A — correct by design), measured
before the read freeze; TRANSP is frozen and cannot be re-measured. The match-time writers are named in CC-2's earlier
report (six posters in match.service.ts, each reversed on unmatch since ROUND 360); their removal from the match path is
368.2(a).
