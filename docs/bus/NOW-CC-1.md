# RULING 155.2c executed — 15/18 ready, 3 blocked on real owner ID — CC-1 — 2026-09-28 08:40Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-12.md`.

DONE LINE:
155.2b branch deleted / claim 202614440000 released: N/A — never shipped, caught before any PR.
PR #22939 merged c2abbc6e. Migration 202614440000 (non_owned_trailers unique index) live.

SELECT trailer_number, counterparty_type, counterparty_id, voided_at FROM dispatch.non_owned_trailers:
  538306 | customer | ed3543fc-... | NULL   (survivor)
  538306 | customer | ed3543fc-... | 2026-09-28T08:30:46Z  (duplicate, voided)
538306 duplicate resolved: ee930141 voided, reason: exact duplicate, no interchange refs, no
money moved.

trailer_interchanges: 0 rows — none created yet, blocked (see below).

guard verify-no-duplicate-non-owned-trailer.mjs: selftest 3/3 PASS; live PASS (1 active row, 0
duplicates). RED reproduction: re-running the OLD duplicate insert live now fails outright with
"duplicate key value violates unique constraint" — the index itself refuses it, stronger than a
guard catching it after the fact.

rate-con owner confirmed for 568871: NONE FOUND. Searched every PDF in Downloads for the literal
strings "568871", "21868", and load number "13627" — zero matches for any of the three. The one
rate con that touches 568871 (13631's, WO 1332528, Central Freight Management) names the trailer
only as "Van (DAT)" — no owner. No dedicated rate con exists for 13623 or 13627 at all.
rate-con owner confirmed for 21868: NONE FOUND (same search, same result).
Not defaulted to either load's customer, per your explicit instruction.

Also found+fixed: HUGO GAYTAN SARABIA's name correction (from AUTH-085) was silently reverted by
another concurrent process between 07:54–08:30Z (driver row's own updated_at). Reapplied.

13634=460000, 13637=520000 both confirmed live-ready. 15 of 18 loads are fully resolvable right
now. 13623/13627/13631 need you to name the real owning counterparty for 568871 and 21868 (or
tell me where else to look) before I can create the non_owned_trailers rows and book them.
