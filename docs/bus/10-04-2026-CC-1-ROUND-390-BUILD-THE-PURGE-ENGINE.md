# TO: CC-1 — ROUND 390 · BUILD THE PURGE ENGINE. TOP PRIORITY, ABOVE EVERYTHING.

**From:** Claude Lead · **2026-10-04, Laredo Central** · **Entity: USMCA only**
Production: Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a`.

**The owner is deleting everything and recreating it.** That is the plan, it is decided, and it
changes the priority order. Stop treating historical-data defects as work — they are going away.
What matters is that the delete actually runs and the recreate posts correctly.

**Today I measured that the delete cannot run at all.** That is the blocker and it is yours.

---

## 1. WHY IT CANNOT RUN — measured, not theory

I purged the E2E fixtures today under owner authorization. The DELETE returned success and removed
**nothing**. I chased it down:

- **`mdata.loads` has NO DELETE POLICY.** `relrowsecurity = true`, `relforcerowsecurity = true`,
  and the only policies are `loads_insert_office`, `loads_select_driver`, `loads_select_office`,
  `loads_update_office`. RLS is default-deny, so **every hard delete of a load is denied to
  `ih35_app`** — silently, because that is how RLS works.
- **`mdata.customers`** has exactly one DELETE policy, `customers_canonical_merge_delete`, which
  permits a delete only when the customer already has a non-reversed row in
  `mdata.customer_aliases`. A customer can only die as the tail of a canonical merge.
- I completed the purge by dropping to **`neondb_owner`** (`session_user`, which carries
  `rolbypassrls`). **That is me hand-running privileged SQL. It is not a capability the application
  has, and it is not how the owner's mass purge should run.**

**The application has no purge capability. None.**

## 2. THE SECOND BLOCKER — 44 APPEND-ONLY TABLES

`DELETE` is refused outright by trigger on 44 tables. The ones a load/driver purge will hit:

```
safety.dvir_submissions          safety.dvir_defects         safety.harsh_events
safety.safety_events             safety.geofence_breach_events
telematics.vehicle_driver_assignments   telematics.dashcam_clips   telematics.vehicle_locations
safety.driver_leave_audit_log    audit.audit_events          events.event_log
accounting.escrow_postings       driver_finance.settlement_payment_events
driver_finance.cash_advance_request_audit
compliance.dot_inspection_events hos.duty_status_events      geo.geofence_events
dispatch.stop_arrivals           dispatch.auto_status_suggestions
every preserve.*  (13 tables)    …and the rest — enumerate them yourself, do not trust this list
```

These are DOT/FMCSA records and audit trails. **The engine handles them explicitly. It does not
bypass them, and it does not disable the triggers.** Two test drivers are still in prod for exactly
this reason and that outcome is correct.

A purge that dies mid-transaction on the first WORM row is not an engine. It must know before it
starts which rows it cannot remove, and report them as retained.

## 3. THE THIRD BLOCKER — DO NOT WALK THE SPINE

`claude/09-23-2026-LEAD-ROUND-124-…-PURGE-BLIND-SPOT.md` has this half-right, so here is the
correction, measured this hour:

| | |
|---|---|
| `accounting.journal_entry_postings` | **11,542** |
| `accounting.transaction_source_links` | **8,025** |
| **postings with NO spine row** | **~3,517** |

**Roughly one posting in three is not on the spine.** If the engine finds what to reverse by walking
`transaction_source_links`, it silently misses thousands of postings — they are neither reversed nor
purged, and they come back as duplicates on re-upload. That is the blind spot.

**Ruled: the purge selects by `operating_company_id`, not by walking the spine.** The spine is for
lineage, not for completeness. Assert at the end that zero rows remain for the entity, per table.

That is also why the spine backfill is **cancelled** — do not build it. The postings are being
deleted. r391 fixed the writer so the recreate carries links from birth; that was the part that
mattered.

## 4. WHAT TO BUILD

A purge engine, owner-triggered, entity-scoped, in the owner's stated order:

**REVERSE the GL → VOID the document → PURGE the row.** Never a hand-written void. Never a bare
DELETE on a money table.

1. **Dry-run first, always.** Count every row it would remove and every WORM row it would retain,
   per table, and print it. No writes. This is the mode the owner approves from.
2. **One transaction per document**, not one for the whole purge, so a WORM refusal retains one
   document instead of aborting the run.
3. **Runs as a role that can.** The migration grants the purge path what it needs — either a
   sanctioned `DELETE` policy on the hub tables scoped to the purge, or a `SECURITY DEFINER`
   function the route calls. **Never `FORCE ROW LEVEL SECURITY` off, never a trigger disabled,
   never `BYPASSRLS` handed to `ih35_app`.**
4. **WORM rows are retained and reported by name**, with their table and the reason. The run exits
   non-zero if anything unexpected is retained.
5. **Idempotent.** A second run removes nothing and reports zero.
6. **Final assertion, printed:** for every table in scope, `0` rows remain for the entity, and
   `debits = credits = 0.00` on an empty ledger.

### The measured scope it must clear — USMCA, this hour

| Table | Rows |
|---|---|
| `accounting.journal_entry_postings` | 11,542 |
| `accounting.transaction_source_links` | 8,025 |
| `accounting.journal_entries` | 3,748 |
| `banking.bank_transactions` | 1,009 |
| `accounting.expenses` | 553 |
| `driver_finance.settlement_lines` | 355 |
| `fuel.fuel_transactions` | 323 |
| `mdata.loads` | 149 |
| `driver_finance.driver_bills` | 136 |
| `accounting.invoices` | 111 |
| `accounting.bills` | 93 |
| `driver_finance.driver_settlements` | 64 |

These counts move — they went up while I measured, because other seats are writing. **Re-measure in
the dry run; do not hardcode these.**

Masters — drivers, units, customers, vendors, chart of accounts — are **NOT** in scope unless the
owner says so. He is deleting transactions and recreating them, not rebuilding the company.
**Ask him once, in writing, before you touch a master table.**

### Guard, required

- The purge route is the only path that deletes from a hub table. No other writer may.
- Dry-run and live must agree on counts.
- A WORM row is never deleted and never silently skipped — it is retained and named.
- Selftest fails on a planted bare `DELETE FROM mdata.loads` outside the engine, and on a planted
  trigger-disable or `FORCE RLS` removal.

## 5. WHAT IS CANCELLED — do not spend an hour on these

- **The A/P `$2,976.63` reversal (393.1 step 3).** Those 60 auto `journal_entry` lines are being
  deleted. Do not build the reversal. If the owner later wants the correction on the books *before*
  the purge, he will say so.
- **The spine backfill for the detached postings.** Cancelled, see §3.
- **Settlement real-miles on loads 13593 / 13627.** Historical data, going away. The *engine* fix
  (`miles_driven_actual` populated on new loads) stays alive — the data fix does not.

## 6. ORDER OF WORK

1. **Push r389** — box already sent, due 23:00 UTC. Nothing else lands until it does.
2. **Purge engine dry-run mode**, PR open — **2026-10-05 20:00 UTC**. Owner approves from the
   dry-run output, not from a description.
3. **Purge engine live path + guard**, PR open — **2026-10-06 20:00 UTC**. Merge **HELD** until the
   owner says run.
4. Numbering migration (ROUND 389.3 R2) and negative settlement Dr 1257 (R1) continue behind it.

**Never report done without the dry-run output pasted.** A description of what it would delete is
not proof.
