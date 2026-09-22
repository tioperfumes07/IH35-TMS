# NUMBERED WORK REGISTER — 2026-09-22 · 48 TASKS · EVERY PENDING ITEM
**Every task is numbered `N of 48`. A seat reports by number. Nothing is "in progress" without a
number. Nothing is DONE without live proof pasted against its number.**
Built from live production reads, the repo at main, 40 merged PRs (#22172–#22217) and all three
OUTBOX files. Lead: Claude Opus 5.

---

## WHY AUTOMATION HAS NOT BEEN FIRING — the owner's question, answered
*"IF YOU DO NOT FIND THE ENGINES AND LINKAGE EASILY, HOW AM I TO TRUST THE APP WILL USE THEM
CORRECTLY OR AUTOMATICALLY?"*

**The chain is wired and it is correct. Verified:**
```
driver PWA depart          driver/loads.routes.ts:711        ─┐
stop stamping              dispatch/stop-stamp.service.ts:125 ├─> latchOnDeliveryEvidence
bulk transition            dispatch/loads-bulk.routes.ts:198  │      │
dispatch transition route  dispatch/loads.routes.ts:2057     ─┘      ├─> revenue latch
                                                                     └─> fireFactoringAutoSubmit
                                                                          └─> autoSubmitDeliveredLoadToFactor
                                                                               factoring/auto-submit-on-delivery.service.ts:73
```
Its own gate, verbatim: *"after the delivery commits **and the customer invoice is durably
`sent`**, auto-submit it to the assigned factor… **No-op when the customer is not
factor-assigned.**"*

**IT DID NOT FIRE FOR TWO MEASURED REASONS, NEITHER OF THEM A CODE DEFECT:**
1. **Every load was FED, not created in the app.** No driver ever stamped an arrival or departure,
   so nothing ever pulled the latch. (Proof: 2026-09-11 00:25, five loads arrive as
   closed + delivered + invoiced **in the same minute**.)
2. **The invoices sit at `proforma`.** The latch requires `sent`. 13610 / 13612 / 13613 / 13614 /
   13615 are all `proforma` — so auto-submit correctly no-ops.

**From the first load dispatched in-app, this chain fires by itself.** The fed backlog needs a
one-time catch-up (tasks 1–9), not a rewrite.

**The reason it was hard to find is the reason it is hard to trust — and that is now fixed:**
`docs/manuals/capability-registry.json` names every engine with its file and line, and
`verify-no-capability-regression.mjs` (task 40) fails the build if one disappears or is
duplicated.

---

# P0 — TODAY. DISPATCHING STARTS TODAY.

| # | task | seat | measured now | done when |
|---|---|---|---|---|
| **1 of 48** | Invoice the 4 pre-settlement loads — move `proforma` → `sent` so the auto-factor latch can fire | CC-2 | 13610 $5,900 · 13612 $4,900 · 13613 $5,700 · 13614 $3,450 all `proforma` | all 4 `sent`, auto-submit observed firing |
| **2 of 48** | Run the EXISTING Faro importer `preview_only` against `01-FARO/PURCHASE REPORT ALL.csv` | CC-2 | 88 purchase rows; importer at `faro-csv-import.ts:530`, route `POST /api/v1/factoring/import/faro` | matched vs unmatched list posted, with reasons |
| **3 of 48** | Commit the matched Faro purchases; set `factoring_status='advanced'` | CC-2 | 12 of 17 `not_factored` are mismarked | `not_factored` = the true 5 only |
| **4 of 48** | Populate `factor_profile_id` | CC-2 | **NULL on all 80 invoices** despite 1,216 live customer factoring assignments | 0 factored invoices with NULL profile |
| **5 of 48** | Link the orphan factoring advances | CC-2 | **114 advances, only 63 linked → 51 orphans** | 0 orphans or each named with a reason |
| **6 of 48** | Fix 13613's reference | CC-1 | app has PO `4504493857`; AlwaysTrack + Faro use W/O **`1013583-2`** (Faro inv #92, $5,700) | W/O matches AlwaysTrack |
| **7 of 48** | Assign units to the 4 open loads with none | CC-1 | 13614 → **T173** per AlwaysTrack; 13615/13616/13617 none | all 5 open loads carry a unit |
| **8 of 48** | Fix the 13609/13614 unit swap | CC-1 | app puts **T173 on 13609**; AlwaysTrack puts it on **13614** | matches AlwaysTrack |
| **9 of 48** | Assign trailers + fix `trailer_type` | CC-3 | **0 trailers on all 4**; `trailer_type='dry_van'` on 3 reefers and 1 flatbed (10202, FB-56210, 10380, 10870) | trailer + type match AlwaysTrack |
| **10 of 48** | Add W/O or PO to the 4 open loads with no customer reference | CC-1 | 13609 · 13616 · 13617 · 13618 carry **none** — **they cannot be factored as they stand** | every open load has a reference |

# P1 — MONEY AT RISK

| # | task | seat | measured now | done when |
|---|---|---|---|---|
| **11 of 48** | `voidDocument()` dispatcher over the **five** engines | CC-1 | dispatcher does not exist; engines verified at void.service.ts:521, posting-engine:3005, poster:1197, settlement-bill-payment:914, journal-entries:554 | all route types dispatch through it |
| **12 of 48** | Post the signature to CC-3's OUTBOX | CC-1 | CC-3 blocked on it | posted |
| **13 of 48** | Count + characterise the NULL-source postings **before** any backfill | CC-1 | **440 live posting lines · $315,323.20 debits · 0 distinct source id** | derivable vs not, both counted |
| **14 of 48** | Backfill `source_transaction_type`/`_id` where derivable | CC-1 | invisible to every document-keyed sweep | column populated, not a side sweep |
| **15 of 48** | Backfill the voided-with-live-postings documents | CC-1 | **207 docs · $350,234.69** (bills 28/$294,210.72 · expenses 179/$56,023.97) | 207 → 0 |
| **16 of 48** | Wire banking `/void` routes | CC-2 | — | dispatching through 11 |
| **17 of 48** | Wire `deductions.routes.ts` + settlement voids | CC-3 | **an applied deduction is NEVER reversed** | dispatching through 11 |
| **18 of 48** | `credit_memo` / `liability` → `reversalJournalEntryId: null` + register entry + tripwire | CC-1 | **both have ZERO posting lines — subledger-only today** | wired + guard fails on first posting |
| **19 of 48** | GL 1000 negative balance | CC-2 | **−$74,263.96** on an asset, 673 postings | root-caused |
| **20 of 48** | GL 1090 Undeposited Funds | CC-2 | **$83,842.22** — suspected other side of 19 | root-caused |
| **21 of 48** | A/R vs Faro control gap | CC-2 | **$80,289.59** → Bucket A $43,160.00 + Bucket B $37,129.59 | invoices named |
| **22 of 48** | 13533/13539 — **HELD, owner release only** | CC-3 | $500.22 + $670.68 on locked settlements, `paid_at` NULL | owner decides |
| **23 of 48** | `INV-2026-00009` draft unsent 10 days | **OWNER** | business action, not code | sent or voided |
| **24 of 48** | Duplicate `display_id='INV-2026-00009'` on two live invoices | CC-1 | silent `LIMIT 1` ambiguity | unique |
| **25 of 48** | $428.87 / $1,847.24 reserve residual | CC-2 | RESERVE REPORT window does not cover the full population | **do not force a false close** |
| **26 of 48** | 3 self-carried invoices missing from the app | CC-2 | 010 Supply Chain Mgmt · 026 IM Specialized · 074/13593 Alligator | reported before anything is created |

# P2 — DATA TRUTH

| # | task | seat | measured now | done when |
|---|---|---|---|---|
| **27 of 48** | Settlement→status trigger (write path) | CC-1 | settlements.routes.ts 955/1080/1273 write **nothing** to `mdata.loads` | fires on settle **and** invoice, per the ruling |
| **28 of 48** | The 24 stale-status loads — **report, do not mass-update** | CC-1 | settled + driver-billed + expensed, still `dispatched`/`delivered` | owner sees them |
| **29 of 48** | 19 settled loads absent from the database | CC-1 | from 122 parsed settlement loads | identified + reported |
| **30 of 48** | Unit/driver backfill from settlement documents | CC-1 | 9 unit-missing · 3 unit-wrong · 3 driver-missing of 103 matched | every row cites its document |
| **31 of 48** | 5 no-driver / 9 no-unit / 11 no-load expenses | CC-1 | 13463 13475 13502 13505 13507 | answered or exempt with a reason |
| **32 of 48** | Genaro Guerrero Chavez merge — 10 tables, one atomic script | CC-1 | 2 collision-risk tables resolved, not skipped | duplicate archived, never deleted |
| **33 of 48** | Leonel Morales + Carlos Mauricio trio — **stay OPEN** | CC-1 | no hard identifier | **never merged on name similarity** |
| **34 of 48** | IFTA-GALLONS-04 via `integrations.relay_fuel_transactions` | CC-3 | 118 rows / 12,537.778 gal; **32 exact + 66 prefix address matches; 117/118 carry a txn ref** | txn-ref join first, then exact only |
| **35 of 48** | LOVE'S 604 → `mdata.locations` + `geo.geofences` | CC-3 | **7 geofences total, 0 Love's**; seed 604 stores / 42 states / 0 rejected | both halves, linked, with a stated radius |
| **36 of 48** | `catalogs.ifta_states` — seed or retire | CC-3 | **0 rows** beside a populated `reference.ifta_tax_rates` (96) | decided, not left empty |
| **37 of 48** | `reports.ifta_filings` — the filing chain | CC-3 | **0 rows. No IFTA filing has ever been produced.** | chain built or scoped |
| **38 of 48** | JE memos | CC-2 + CC-1 | **2,422 of 3,018 machine strings**; longest 706 chars | fixed at the writer, then backfilled |
| **39 of 48** | Mileage feed from settlement documents | CC-1 | 122 loads parsed | **locate + report path and row count BEFORE feeding** |

# P3 — SAFEGUARDS. **These are what stop us returning to July work.**

| # | task | seat | measured now | done when |
|---|---|---|---|---|
| **40 of 48** | `verify-no-capability-regression.mjs` | CC-1 | registry has 14 verified capabilities | fails on missing symbol, moved file, **or a duplicate definition** |
| **41 of 48** | `verify-one-canonical-active-load-set.mjs` | CC-1 | **MISSING** | red-before-green |
| **42 of 48** | `verify-load-costs-board-excludes-settled.mjs` | CC-1 | **MISSING** | red-before-green |
| **43 of 48** | `verify-every-void-route-reverses.mjs` | CC-1 | **MISSING** | red-before-green |
| **44 of 48** | `verify-no-voided-doc-has-live-postings.mjs` | CC-1 | **MISSING** — baseline 207, predicate "voided AND no replacement open" | red-before-green |
| **45 of 48** | `verify-je-memo-is-human-readable.mjs` | CC-2 | **MISSING** — baseline 2,422 | red-before-green |
| **46 of 48** | `verify-loves-geofences-seeded.mjs` | CC-3 | **MISSING** | red-before-green |
| **47 of 48** | `verify-relay-deposits-sync-is-scheduled.mjs` | CC-2 | **MISSING** | red-before-green |
| **48 of 48** | Relay deposit sync — fetch + daily cron | CC-2 | **no deposit endpoint in `relay-client.ts`, no deposit cron for any entity**; 175 deposits all non-USMCA from one hand-run import 2026-07-17 | daily cron with its UTC expression and next fire time |

---

## RULES FOR THIS REGISTER
- **Report by number.** "14 of 48 DONE" with the live proof pasted, or "14 of 48 BLOCKED on X".
- **A guard assigned and not written is not a guard.** 8 of the 9 above are still missing.
- **Before declaring anything missing** → `docs/manuals/01-DATA-SOURCE-REGISTER-READ-BEFORE-SAYING-MISSING.md`.
- **Before building anything** → `docs/manuals/capability-registry.json`. Grep first.
- **FIND IT, FILE IT, DO NOT FIX IT** outside your lane.
- **Nothing is deleted. Every void keeps a register. No sample rows in USMCA, ever.**
