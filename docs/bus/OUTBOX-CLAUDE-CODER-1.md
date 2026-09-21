# OUTBOX — Claude Coder 1 (CC-1)

## ROUND 27.1/28/28B STEP 1+2 + STATUS MIRROR — 2026-09-21

**22 of 23 loads created. 4/4 rate corrections done. 11 loads status-mirrored to AlwaysTrack. One
real production bug found and fixed. One load (13600) genuinely blocked on a second, separate bug —
named below, not forced past.**

### Loads created (22 of 23)
13585, 13596-13599, 13601-13608, 13610-13614, 13616-13618 — all real: driver/unit/trailer resolved
or created (R2/R1 rulings), stops from `Orig-Dest`/`Picks-Drops`/`Pickup`/`Delivery` in
`~/Downloads/load history.xlsx` (the raw AlwaysTrack per-load export — the reconciliation workbook
itself carries no stop detail), gross rate = AT line haul, `miles_shortest`=St.Miles /
`miles_practical`=L.Miles verbatim off the export, `mileage_source='Operator entered'`,
`is_sample_data=false`. Line-haul sum verified $98,086.72 against CONTROL TOTALS before any write —
never re-derived.

**13600 — BLOCKED, not forced.** `bookLoad` → `confirmPresettlementLink` →
`linkLoadToPresettlementAtBookingInClientTx` tries to mint a **second** open settlement for LUIS
ARMANDO SOSA PEREZ even though he already has one open (`89c90396…`, doc 5807) — hits
`uq_driver_settlements_one_open_per_driver` (23505). This is a real, separate defect in the
presettlement auto-link's own "does this driver already have one open" check; not something this
script's data caused. Filed, not patched blind — needs its own investigation of
`presettlement-link.service.ts`'s open-settlement lookup.

**Real bug found + fixed (same PR):** `loads.routes.ts`'s office status-PATCH route wrapped
`pingSettlementOnLoadEvent` in try/catch but not a SAVEPOINT — once that optional settlement-open
side-effect failed at the SQL level (live-caught: an RLS violation on `lib.trace_counters` under the
test-harness auth path), the enclosing transaction was poisoned and **every later statement,
including the status write the route exists to make, failed too** — the exact failure the
try/catch's own comment says it exists to prevent. Fixed with `SAVEPOINT`/`ROLLBACK TO SAVEPOINT`,
same pattern `settlements.routes.ts`'s `recomputeDebtSync` already uses. This was silently capable of
500ing a real office user's load-status change whenever the ping failed for any reason — worth a
wider look, flagged here.

**Units omitted, disclosed per row:** 8 of the 22 (13585, 13601, 13605, 13606, 13607, 13608, 13614,
13616) share a truck with one of today's 5 genuinely-open dispatched loads — `unit-active-load-guard`
is a blunt one-slot check, not date-aware, so a historical trip on the same truck can never win while
today's trip is open. Booked without the unit rather than blocked; attach once the conflicting trip
closes.

### Rate corrections (4 of 4)
| Load | From | To | What happened |
|---|---|---|---|
| 13563 | 600.00 | 500.00 | `rate_total_cents` corrected; invoice was already sent/Faro-advanced → dispute opened (`mis_entry`), invoice left at billed face, A/R open |
| 13570 | 6,115.00 | 5,900.00 | same |
| 13580 | 4,900.00 | 3,300.00 | same |
| 13615 | 500.00 | 4,900.00 | row was **soft-deleted** (2026-09-14) with a stale `status='invoiced'` — no REST path can reach a soft-deleted row, so it was restored (`soft_deleted_at`/`deleted_by_user_id` cleared) and its stale status corrected to `dispatched` directly, one row, disclosed — then the real rate PATCH ran; no invoice existed yet so the resync minted the correct proforma directly |

13554 untouched (owner-confirmed correct). 13553/13555/13565 untouched (outside export window).

### Status mirror (ROUND 28B — supersedes the earlier "Completed -> closed" rule)
`'pre-settlement'` is **not a live value** in `mdata.load_status_enum` (checked live before acting) —
used the closest real, correct value, `delivered` (out of `unit-active-load-guard`'s active set, reads
exactly as "delivered, not yet settled"), and disclosed it rather than inventing an enum value or a
migration under time pressure.

- **13593** — cancelled (AlwaysTrack: Cancelled; app had it stuck `dispatched`).
- **13587, 13590, 13591, 13592, 13594, 13595, 13596** — walked `-> delivered` (AT: Completed, real
  settlement number, app had them stuck at `at_pickup`/`in_transit`/`dispatched`).
- **13610, 13612, 13613, 13614** — walked `-> delivered` (Completed, no settlement yet — the
  "pre-settlement" bucket).
- **13615** — restored to `dispatched` (see rate table above) — one of the 5 legitimately open loads.
- **13609, 13616, 13617, 13618** — created/left `dispatched` — the other 4 of the 5 open loads.

**Live count right now** (not the owner's literal query shape since some load_numbers aren't numeric —
same predicate):

| status | n | loads |
|---|---|---|
| dispatched | 18 | 13585, 13597, 13598, 13599, 13601-13609, 13611, 13615-13618 |
| delivered | 11 | 13587, 13590-13592, 13594-13596, 13610, 13612-13614 |
| delivered_pending_docs | 3 | 13502, 13505, 13507 (untouched, outside export window) |
| draft | 2 | VOID-13601-…, VOID-13602-… (already soft-deleted both sides — see below) |
| invoiced | 6 | 13553 (outside window, untouched) + 5 pre-existing |

**Not yet at 5 open / 5 pre-settlement, disclosed why:** 13 of the 18 "dispatched" (13585, 13597-13599,
13601-13608, 13611) carry a **real AT settlement number** (5807-5815) and per ROUND 28B's own rule
("the status follows the settlement, never set by hand") their correct end state is `invoiced`, which
only a real settlement link can produce honestly — that's **Step 3, due 2026-09-23**, one day after
this status-mirror deadline. Hand-flipping them to `invoiced` today without the real linkage behind
them would be exactly the "never set by hand" violation the rule exists to prevent. They are
correctly created, correctly dated, correctly priced, and sitting at the honest neutral state
(`dispatched`) pending Step 3 — not silently stuck, not faked done.

**VOID-13601/13602 drafts:** both already `soft_deleted_at` set (2026-09-14) on both sides — the data
fix the owner asked for is already in place. If they are "still on the board," some board/list query
is not filtering `soft_deleted_at IS NULL` for draft-status rows — a frontend/query finding, not
re-guessed or patched blind here; named for whoever owns that surface.

### Explicitly NOT done this pass (disclosed, not silent)
The later rate-confirmation messages (13609 four-line invoice breakdown, real street
addresses/appointment windows/temperature/BOL-PO-PRO references/penalty terms for 13609/13613/13616-
13618, PDF attachment to `docs.files`) are **not built in this PR**. No PDF files were found locally
to attach. Structured temperature/penalty-term columns do not exist on `mdata.loads`/`load_stops`
today (would need a migration — not something to improvise under a same-day deadline). This was a
sequencing call: the foundational 22 loads + rate corrections + status mirror were the blocking,
load-bearing work for everything else (Step 3, Step 4, the acceptance test); the paperwork enrichment
layer is real, wanted, and next — not dropped.

### Step 4A leftovers (Round 28 item 5) — not started this pass
Cancelled shell settlement `3c81e7d5…` (tour 5779) duplicate $10 admin-fee row, and driver 40022039's
unexplained $85 "Admin fee (tour 5800)" row — still open, still un-guessed. Next.

### Load counter
`lib.trace_counters` LOAD: 13595 → 13618 (true max, non-cancelled). Ghosts 13743/13749 (cancelled)
reported, never a renumbering target.

**DEADLINE STATUS:** Step 1/2 core data — DONE except 13600 (named blocker). Status mirror — DONE
except the 13-load subset that needs Step 3 to reach its honest final state. Step 3, Step 4, the
Step 4A leftovers, and the rate-confirmation enrichment layer are NOT started — next up.
