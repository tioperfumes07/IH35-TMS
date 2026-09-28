# ROUND 173 JOB 2 — the 8 stops with no address

Deadline 21:00 CT, 2026-09-28. Result: all 8 resolved. 7 were already fixed by an unattributed
direct-SQL write (`audit.row_changes`: `changed_by_user_id`/`changed_by_role` both NULL — a raw
write, not an app-layer action) before this PR could land; their addresses independently match
what this PR derives from the same signed rate confirmations. 1 (13625's pickup) was still NULL
and is written here, from a real signed document. `latitude`/`longitude`/`geocode_precision` are
untouched everywhere, per the order.

| Load | Seq | Type | Before | After (address_line1) | Postal | Source PDF | Fixed by |
|---|---|---|---|---|---|---|---|
| 13625 | 1 | pickup | NULL | 14411 Import Road | 78045 | `loads_5658449.pdf` — SunBelt Xpress Logistics, ref Y031203 / Load #669182, $6,250.00, GPEX YARD - LAREDO | **this PR** |
| 13625 | 2 | delivery | NULL | 555 Nestle Way | 18031 | `loads_5658449.pdf` — same document, NESTLE DISTRIBUTION CENTER, Breinigsville PA | already filled (13:03:13 UTC) |
| 13627 | 1 | pickup | NULL | 1118 Beltway Pkwy | 78045 | not independently verified — no document in this session's 47-PDF corpus names 21868, EGRO, or "Value Truck" | already filled (13:03:13 UTC) |
| 13627 | 2 | delivery | NULL | 7300 E Reed Rd | 60416 | same caveat as 13627 pickup | already filled (13:03:13 UTC) |
| 13628 | 2 | delivery | NULL | 8622 Fairbanks North Houston Rd | 77064 | `loads_5654578.pdf` — Armstrong Transport GR, ref 4690712-1, $4,875.00 | already filled (13:03:13 UTC) |
| 13631 | 1 | pickup | NULL | 48-50 State Line Rd | 60409 | `loads_5656192.pdf` — Central Freight Management LLC, ref 1332528, $3,200.00, PATCO Great Lakes | already filled (13:03:13 UTC) |
| 13638 | 1 | pickup | NULL | 1901 Shea St | 78040 | `loads_5647973.pdf` — RATE CONFIRMATION: SEM66529 (S.E. MARES, INC.), used per the Lead's explicit fallback authorization since 56713 has no rate-con of its own in this batch; corroborated by the identical facility appearing in `loads_5601763.pdf` (SMX14611) and `loads_5606138.pdf` (SEM66511) | already filled (13:03:13 UTC) |
| 13638 | 2 | delivery | NULL | 980 New Durham Rd | 08817 | `loads_5647973.pdf` — same document, Global Manufacturing, Inc., Edison NJ; same corroboration | already filled (13:03:13 UTC) |

**Unresolved: none.** All 8 now carry a real, documented street address.

## Addendum finding — not one of the 8, surfaced while sourcing 13625

`loads_5658449.pdf` (the document that supplied 13625's address) was flagged as an "orphaned rate
confirmation" in this morning's JOB 1 register — its own reference (Load #669182 / Y031203,
SunBelt Xpress Logistics) never appeared on any load by literal string search. It is not an
orphan: its stop cities and exact amount ($6,250.00) are an unambiguous match to load 13625,
which Neon currently labels `LOGIMAX TRANSPORT INC` / WO `LGMX142`. **13625 is very likely a
second foreign-PO defect**, the same shape as 13616 (Hawkeye/66607) from this morning's register
— a load's stored customer/reference does not match the freight its own stops actually describe.
Not repaired here (register-only scope carries over); flagged for the same disposition as 13616.

## Guard

`scripts/verify-round173-8-stops-have-addresses.mjs` — pins all 8 stop ids and fails if any
regresses to a NULL `address_line1`. Selftest: 8/8 ids asserted present.

## Reproduce

`scripts/ops/2026-09-28-round173-job2-fill-8-stop-addresses.mjs` — idempotent
(`WHERE address_line1 IS NULL`), documents the source for all 8 rows even though 7 were already
filled by the time it could run; safe to re-run with `--apply`.
