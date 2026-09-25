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
