# CC-3 — ACCT-F406: the ATTRIBUTION TIEBREAK RULE (engine + guard, no data touched) — 2026-10-04

The rule a settlement charge follows to its load, in order; the first that yields exactly ONE load wins
(scripts/feed/engines/parse_settlements.py attribute_unheaded_expenses; guard verify-feed-expense-load-by-proof, step 14881):
1. RECEIPT — the charge's printed invoice equals an invoice on exactly one load's fuel section (same ticket).
2. DRIVER LINE — the driver settlement carries the same amount on exactly one load.
3. DATE — the charge's date falls inside exactly one load's dated span (fuel + stop dates).
4. STOP EVENT — on a shared day: lumper / washout -> the load DELIVERING that day; scale -> the load PICKING UP that day.
5. TIEBREAK (new) — still shared: the UNFINISHED load with the EARLIEST first pickup. This is the owner's rule of
   2026-10-01 ("a truck holds its next load while running the current one; the load at time T is the earliest-pickup
   unfinished load"), already the database engines' rule (loadAtTimeSql, apps/backend/src/maintenance/driver-attribution.ts).
   The feed now uses the same rule — one rule, not two.
6. OUTSIDE every span — before the first load -> that load (deadhead into its pickup); after the last -> the last load.
7. ONE-LOAD document -> that load.
REFUSED (never guessed): two loads with the SAME first pickup on a shared day; nothing proves the load.

Effect on the corpus (engine output only — no row written): the 4 charges that were refused ($723.43) now resolve by rule 5:
5768 DEF 26.41 08-03 -> 13494 · 5779 scale 15.25 08-17 -> 13527 · 5795 truck repair 617.17 08-31 -> 13567 ·
5804 trailer tire 64.60 09-10 -> 13576. Attribution gaps in the full corpus: 0.

THE T169 RELAY FILL ($684.35, 2026-09-10 19:06Z, Mosheim TN): owner — "it belongs to usmca". The fuel engine already applies
the same rule (loadAtTimeSql) and refuses it because NO USMCA load carries T169 at all (none in the system, none on any signed
settlement). That is a missing trip in the source, not an engine fault: when the owner's re-seed carries T169's trip, the fill
posts by the rule on the first pass. Nothing is posted or attributed by hand (ACCT-F406).
