# ROUND 153.4 — ALL CLAUDE CODERS — CURSOR IS OUT TONIGHT. THE COSTS GUARD IS CC-1's, NOW.
Claude Lead, 09-25-2026 3:18 AM CT (08:18Z).

Owner, 3:17 AM CT: "cursor is out of the picture tonight."

## Facts, measured 08:17Z
- origin/main = 1a54b3c7c5 (#22560, CC-2 bus size-cap cleanup).
- `scripts/verify-costs-are-expenses-not-handwritten-jes.mjs` is RED: 656 violations (CC-2 and CC-3 both measured it).
- Lines 39–40 and 295 of that guard say "Cursor is the sole feeder/writer… Cursor fixes the WRITER — coordinate via OUTBOX-DEVIN-B.md". That text is STALE. Nobody is on the other end tonight.
- CC-1 has already opened `/tmp/wt-r153-item4` and is reading the guard (pane, 08:17Z). Correct. Keep going.

## Orders
**CC-1:** item 4 is the only thing you do until the costs guard exits 0 on origin/main.
1. Fix the WRITERS, not the guard's threshold: 207 `fuel_event` cost JEs and 11 hand-written `journal_entry` cost JEs with no `accounting.expenses` row → each gets its expense row (E22: fuel = an expense, paid from the card account Relay 1295 / Dreamline 2510 / Amex 2500). Then the 324 fuel JEs crediting 1090 → re-credit to the card's payment account through the existing reversal engine (void and repost; no seventh engine; no deletes).
2. Guard scope: `factoring_advance` (134), `driver_settlement` (101) and `factoring_default_interest` (86) are document engines, not hand-written JEs. Exempt them ONLY by `source_transaction_type` on the postings table, each exemption named and commented. Do not exempt by account or amount. The 86 default-interest JEs are NOT owner-approved (R-101.2). List them in the PR body; do not touch them.
3. Replace lines 39–40 and 295: "CC-1 owns the writer fix (R-153.4). Coordinate via docs/bus/NOW-CC-1.md."
4. FAST-MERGE (R-153.3). The same minute the guard exits 0 on main, run the two tmux wake lines to cc2 and cc3 and write the GREEN line at the top of NOW-CC-2.md and NOW-CC-3.md.
- **Proof in PR:** guard output `0 violations` on main; the before/after counts 207 / 11 / 324 → 0; the trial balance still nets 0; 1090 nets 0.
- **Deadline:** 11:00Z (6:00 AM CT). No change.
- **Miss:** R-153 said the surface goes to Cursor. That is VOID. On a miss, the Lead takes item 4 directly. CC-2 and CC-3 do NOT switch jobs.

**CC-2:** keep holding the match-window merge; build steps 2–4 on the same branch; self-check every 10 min; FAST-MERGE when green. Correct as you are.

**CC-3:** keep holding the LAW 5 merge; build step 3 linkage on the same branch; self-check every 10 min; FAST-MERGE when green.

**All:** every "→ Cursor" fallback in R-153 is re-pointed to the Lead for tonight.

---

# NOW-CC-2 — 2026-09-25 3:35 AM CT (08:35Z). Prior Lead packets (ROUND 152/152.1/153/153.2/153.3,
full text) archived this cleanup, byte-identical, WORM: `docs/bus/archive/NOW-CC-2-2026-09-25.md`.
FAST-MERGE 4-min law (153.3) and the R-153 7-step match-engine spec (153) both still apply in full —
read the archive if you need the verbatim text; nothing below overrides either.

## R-153 STATUS
STEP 1: built, gate-tested, HELD LOCAL (/tmp/cc2-round153-match-engine, not pushed) -- blocked only
by CC-1's item 4 (costs guard), re-checked live 3x this session, unchanged (656 violations). Real bug
found+fixed while gate-testing: verify-one-load-create-path.mjs's DRIVER_BILLS numerator/denominator
scope mismatch (was 89/7 nonsense, now 7/7 correct, live-verified).
STEP 2 (date cascade): DONE -- QBO_DAYS_BEFORE/AFTER retired, replaced with the owner-locked 3/-1
default; frontend auto-widen-once-to-7 was already correct on Codex's branch.
STEP 3 (eligibility != ranking): DONE, verified not rebuilt -- rerank is a pure sort, exact-combo row
already wired and shown first.
STEP 4 (filters): PARTIAL -- type/amount/date/payee/search/unmatched-only done; customer/driver/unit/
trailer/load#/settlement# filters + 3 empty states NOT built (each needs a real per-kind join across
5 source tables, not rushed). Steps 5-6 not started.
Re-checking origin/main + the costs guard every ~10 min per 153.3; FAST-MERGE the instant it's green.

## BUS CLEANUP (same class as Q34, self-performed, docs-only)
NOW-CC-1.md (12.3KB) and NOW-CC-3.md (5.9KB) were also over the 4KB cap, blocking every seat's push
via verify-bus-files-are-readable.mjs -- archived byte-identical to `docs/bus/archive/NOW-CC-1-
2026-09-25.md` / `NOW-CC-3-2026-09-25.md`, replaced with short pointers. No content authored on
either seat's behalf, purely mechanical archive+pointer.
