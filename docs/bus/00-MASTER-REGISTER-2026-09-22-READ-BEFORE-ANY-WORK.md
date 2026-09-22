# MASTER REGISTER — 2026-09-22 · EVERY OPEN ITEM, EVERY SEAT, IN ORDER
**Read this before any work. It supersedes every earlier register.**
Lead: Claude Opus 5. Built from a live inventory of the last 36h: 40 merged PRs
(#22172–#22211), all three OUTBOX files, the repo tip, and live production reads
on Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a` under
`set_config('app.bypass_rls','lucia',FALSE)`.

---

## 0 · GROUND TRUTH THE WHOLE COMPANY RUNS ON — DO NOT RE-DERIVE, DO NOT RE-LITIGATE

- **USMCA began operating 2026-08-07** on **IH35 Transportation's QuickBooks account and
  AlwaysTrack account.** Reconciliation therefore spans **USMCA-Faro AND Transportation-Faro**
  purchases. Any reconciliation that looks only at USMCA-Faro is wrong by construction.
- **FARO AND ALWAYSTRACK ARE THE SOURCE OF TRUTH. THE APP IS NOT.** Where the app and a Faro or
  AlwaysTrack document disagree, the document wins and the app is the defect.
- **Faro keys on the CUSTOMER REFERENCE, never on our load number.** Match order:
  `mdata.loads.customer_wo_number` → `customer_po_number`. Matching on load number returns zero
  and that zero is a bug in the query, not an absence of data.
- **The round trip is the unit of settlement** (law §2). Three states, not two:
  1. **OPEN DISPATCH** — moving, not delivered. *Dispatch board.*
  2. **PRE-SETTLEMENT** — delivered and invoiced, round trip not closed. **Carries OUR
     pre-settlement number; AlwaysTrack has no equivalent — this is our differentiator.**
     Load Costs is the cost column of this. *NOT the dispatch board.*
  3. **SETTLED** — round trip closed, settlement number issued, numbers frozen. *Reports.*
- **Dispatch renders LIVE CURRENT DATA ONLY** — never historical. Every tab, every wizard, every
  picker. History belongs to Reports.
- **Every load was FED, not created in the app.** Confirmed live: 2026-09-11 00:25 five loads
  arrive as closed+delivered+invoiced in the SAME MINUTE; 75 closed loads across 57 distinct
  minutes. Therefore `at_pickup` / `in_transit` / `at_delivery` / `assigned_not_dispatched` hold
  zero rows **because nothing has walked the lifecycle in-app yet** — they are NOT dead
  vocabulary and stay in the canonical set. Dispatching in-app begins 2026-09-22.

---

## 1 · MEASURED STATE — LIVE, 2026-09-22. Every figure re-measurable.

### 1.1 Loads
```
126 USMCA non-sample loads
  closed 75 (65 invoiced, 70 settled) · dispatched 19 (0, 14) · delivered 11 (0, 7)
  cancelled 10 (0, 6) · invoiced 6 (6, 5) · delivered_pending_docs 3 (0, 3) · draft 2 (0, 0)

Status NOT IN (draft,invoiced,paid,closed,cancelled)          = 33
MINUS demonstrably finished (settlement line / driver bill / issued invoice)
  -> TRULY OPEN                                                =  9 loads / 5 units
  -> STATUS IS STALE ON 24 OF 33

OPEN DISPATCH (5):   13609 · 13615 · 13616 · 13617 · 13618
PRE-SETTLEMENT (4):  13610 · 13612 · 13613 · 13614   (delivered + invoiced, round trip open)
UNITS:               T152 · T156 · T164 · T173 · T176
```

### 1.2 The four pre-settlement loads ARE invoiced in Faro — the app shows all four as uninvoiced
```
load    our W/O       Faro inv  date     purchase    state
13610   1013737       #90       9/21/26  $5,900.00   purchased, escrow 88.50
13612   SEM66514      #64       9/11/26  $4,900.00   purchased AND PAID, wire $4,743.00
13613   1013583-2     #92       9/21/26  $5,700.00   purchased, escrow 85.50
13614   1013714       #93       9/21/26  $3,450.00   purchased, escrow 51.75
                                         ---------
                                         $19,950.00  invisible to the app
```
**13613's reference in the app is WRONG** — we store PO `4504493857`; AlwaysTrack and Faro use
W/O `1013583-2`. **13615 is invoiced in Faro (#87, SEM66538, $4,900.00) while the app still
reads `dispatched`.**

### 1.3 Factoring linkage EXISTS in the architecture. It is MISMARKED, not missing.
**LEAD CORRECTION — I measured this wrong and the owner caught it.** I queried
`factoring_advance_id IS NULL` and called the result "self-carried". **The canonical column is
`accounting.invoices.factoring_status`**, and it works. The architecture already carries
`factor_profile_id`, `factoring_advance_id`, `factoring_status`, `accounting.factoring_advances`
and `views.factoring_balance_invoice_linkage`. **Nobody builds new linkage. We are not missing a
column — we are failing to maintain one.**

```
factoring_status   invoices      total        has advance_id   has factor_profile_id
advanced                 59   $187,890.00          59                   0
submitted                 4   $ 17,270.00           4                   0
not_factored             17   $ 56,472.41           0                   0

accounting.factoring_advances   114 rows / $346,192.96
invoices linked to an advance    63     ->  51 ADVANCES WITH NO INVOICE LINK
```

**Three defects, all maintenance, none architectural:**
1. **12 of the 17 `not_factored` are MISMARKED.** Owner's true self-carried is **5 /
   $12,592.40**, documents in `~/Downloads/IH35-MASTER-RECONCILIATION/05-INVOICES-SELF-CARRIED/`:
   `009 FLS TRANSPORTATION` (in app as 13515, $525.00) · `055 – 13555 2 EMS` (in app, $3,180.00) ·
   `010 SUPPLY CHAIN MANAGEMENT` (**MISSING FROM APP**) · `026 IM SPECIALIZED` (**MISSING**) ·
   `074 – 13593 ALIGATOR` (**MISSING**). Everything else marked `not_factored` was bought by Faro
   and the status was never advanced — including 13610/13612/13613/13614/13615 (§1.2) and
   13579/INV-2026-00010.
2. **`factor_profile_id` is NULL on all 80 invoices** — never populated, despite 1,216 live
   customer factoring assignments on the Faro profile.
3. **51 factoring advances carry no invoice link.**

### 1.4 AlwaysTrack field drift — our app is wrong on every field, not just the invoice flag
```
load   field          AlwaysTrack (truth)        app
13613  W/O            1013583-2                  empty (PO 4504493857 instead)
13614  truck          T173-Own                   NONE
13609  truck          (T173 belongs to 13614)    T173  <- wrong load
13610  trailer        10202 · 53' Reefer         NONE, trailer_type dry_van
13612  trailer        FB-56210 · 53' Flatbed     NONE, trailer_type dry_van
13613  trailer        10380 · 53' Reefer         NONE, trailer_type dry_van
13614  trailer        10870 · 53' Reefer         NONE, trailer_type dry_van
```
`trailer_type = dry_van` on all four; three are reefers and one is a flatbed.

### 1.5 Settlement documents vs database — 122 loads parsed from 116 settlement PDFs
Parser output: `/tmp/settlement_loads.csv`. **All 122 carry truck, trailer AND driver.**
Range 13471..13611.
```
settlement loads parsed        122
NOT PRESENT IN THE DATABASE     19   <- settlements exist for loads the app does not have
matched                        103
  unit MISSING in app            9
  unit WRONG in app              3
  driver MISSING in app          3
  trailer missing                0
```

### 1.6 Void
```
voided BILLS    with LIVE postings    28 docs   $294,210.72
voided EXPENSES with LIVE postings   179 docs   $ 56,023.97
voided INVOICES with LIVE postings     2 docs   $  6,700.00   <- void-and-reissue, NOT orphans
                                     207 docs   $350,234.69   <- the real backfill target
```
29 route files expose `/void`. **Exactly 4 call `postVoidReversal`.** Reversal is opt-in.
**The 207 is a FLOOR, not a ceiling** — CC-3 proved both 13533/13539 settlement header JEs carry
`source_transaction_type` and `source_transaction_id` NULL on every line, invisible to any
document-keyed sweep.

### 1.7 Journal entry memos — 80% machine strings
```
3,018 live posted USMCA JEs
  Fuel txn <uuid>                             1,153   longest memo  45
  Reversal of JE <uuid>: <engineering prose>    679   longest memo 539
  Expense <n> posting                           480   longest memo  30
  Factoring funding <ref>                       110   longest memo  32
  other                                         596   longest memo 706
  MACHINE STRINGS / ENGINEERING PROSE         2,422 of 3,018 = 80%
```

### 1.8 Relay
```
catalogs.relay_accounts            0 rows, every company. CC-3 verdict: live CRUD catalog,
                                   ZERO real-pipeline readers. The live rail is
                                   integrations.relay_company_cards / catalogs.fuel_card_types.
integrations.relay_deposits        175 rows, ALL non-USMCA, ALL created 2026-07-17 by a
                                   hand-run CSV import. USMCA = 0.
relay-client.ts                    ZERO deposit endpoints. No deposit API call exists.
relay-payments/**                  EXACTLY ONE cron — fuel ingest, "0 7 * * *" America/Chicago.
                                   NO deposit cron, for any entity.
USMCA Relay Fuel Wallet            76 txns, ALL draws, LAST 2026-09-11. No Plaid, never synced.
lib.feature_flag_overrides         RELAY_FUEL_INGEST_ENABLED enabled=true for USMCA (NOT the blocker)
relay-client.ts:90-102             relayApiKey() resolves RELAY_API_KEY_<company code> ONLY and
                                   NEVER falls back — by design, to prevent a cross-entity leak.
```
**Owner ruling:** USMCA runs on the **Transportation** Relay account. `RELAY_API_KEY_TRANSP`
already exists and works. The mapping must be DECLARED where a live reader already reads —
**not** by resurrecting `catalogs.relay_accounts`, which CC-3 proved dead.

---

## 2 · THE EIGHT GUARDS I ASSIGNED DO NOT EXIST. NONE OF THEM.
Verified on main 2026-09-22:
```
MISSING  scripts/verify-one-canonical-active-load-set.mjs
MISSING  scripts/verify-load-costs-board-excludes-settled.mjs
MISSING  scripts/verify-every-void-route-reverses.mjs
MISSING  scripts/verify-no-voided-doc-has-live-postings.mjs
MISSING  scripts/verify-relay-deposits-land-in-usmca.mjs
MISSING  scripts/verify-relay-account-mapping-is-declared.mjs
MISSING  scripts/verify-je-memo-is-human-readable.mjs
MISSING  scripts/verify-relay-deposits-sync-is-scheduled.mjs
```
`grep -rn "voidDocument" apps/backend/src scripts` → **no matches.** It does not exist.
**A guard that was assigned and never written is not a guard. No item below is DONE without its
named guard on main and its selftest proven RED-before-GREEN.**

---

## 3 · ORDERED QUEUE — CC-1
**Lane:** `db/migrations/**`, `scripts/verify-*`, `apps/backend/src/accounting/**`,
`apps/backend/src/dispatch/**`, `apps/backend/src/identity/**`, `mdata/drivers**`,
`mdata/loads.routes.ts`. (LANES.md corrected to match law §0b. Read LANE CORRECTIONS.)

1. **CANONICAL ACTIVE-LOAD SET** — 2026-09-22 23:00 UTC. Predicate = status gate **AND** not
   demonstrably finished (active settlement line OR non-void driver bill OR issued invoice).
   One module; every consumer imports it; delete all ten private copies including the misnamed
   `ACTIVE_LOAD_FILTER`. Keep the four zero-row lifecycle statuses. **Load Costs 114 → 5 open /
   4 pre-settlement.** Guard: `verify-one-canonical-active-load-set.mjs`.
2. **DISPATCH LIVE-ONLY, EVERY SURFACE** — 2026-09-23 06:00 UTC. Enumerate every dispatch route
   and screen that returns loads; post the table of rendered-count before/after. No UI filter.
3. **`voidDocument()`** — 2026-09-23 12:00 UTC. Signature ruled in §6. **Post it to CC-3's OUTBOX
   the moment it compiles — he is blocked on it.** It **CALLS** the existing engines
   (`/settlements/:id/reverse`, `reverseSettlementBillPaymentInClientTx`, the deduction
   three-branch dispatch) — it does NOT reimplement them.
4. **VOID BACKFILL** — after 3. Count `source_transaction_type IS NULL` postings FIRST. Baseline
   207, predicate "voided AND no replacement open".
5. **STALE LOAD STATUS** — report the mechanism (does the settlement path advance
   `mdata.loads.status` at all?). **DO NOT MASS-UPDATE the 24 rows.** Fix the writer.
6. **19 SETTLED LOADS NOT IN THE DATABASE** — §1.5. Identify them, report before importing.
7. **UNIT / DRIVER BACKFILL FROM SETTLEMENT DOCUMENTS** — 9 unit-missing, 3 unit-wrong, 3
   driver-missing, source `/tmp/settlement_loads.csv` (122 loads, all with truck+trailer+driver).
   Every row cites its settlement document. **These feed driver pay — provenance mandatory.**
8. **Duplicate `display_id='INV-2026-00009'`** on two live invoices (from CC-2).
9. **`resolveCompanyDirectCreditAccount` operating_bank fix** — handed over by CC-2, branch
   `cc2-round31-1-fuel-poster-operating-bank`, commit 44bffd8c76, **unpushed**. Plus the
   **151 fuel_event postings / −$98,546.47** historical correction as a separate item.
10. **Duplicate drivers** — Genaro Guerrero Chavez merge (evidenced, 10-table footprint mapped).
    **Leonel Antonio Morales and the Carlos Mauricio trio stay OPEN** — no hard identifier.
    **Never merge money-bearing driver records on name similarity.**
11. 5 no-driver loads (13463, 13475, 13502, 13505, 13507) · 11 no-load expenses · `INV-2026-00007`.
12. **JE MEMOS** — fix at the writer for accounting posters; coordinate backfill with CC-2.

---

## 4 · ORDERED QUEUE — CC-2
**Lane:** `factoring/**`, `banking/**`, `accounting/invoices**`, `accounting/daily-close**`,
`accounting/factor-reconciliation/**`. Plus `integrations/relay-payments/**` (assigned — cite
this register under `LANE-CROSS:`).

1. **FARO PURCHASE IMPORT — P0, THE ROOT CAUSE OF FOUR SEPARATE DEFECTS** — 2026-09-23 06:00 UTC.
   Faro purchases must land in the app as the invoice/factoring record. **Match on
   `customer_wo_number` first, `customer_po_number` second, NEVER the load number.** Covers
   **USMCA-Faro AND Transportation-Faro** (USMCA ran on Transportation's accounts from 2026-08-07).
   Sources: `~/Downloads/IH35-MASTER-RECONCILIATION/01-FARO/`. This single import fixes: the
   4 pre-settlement loads reading uninvoiced, the mismarked `factoring_status`, the A/R gap, and
   the active-set predicate's blindness. **Write through the EXISTING columns**
   (`factoring_status`, `factoring_advance_id`, `factor_profile_id`, `accounting.factoring_advances`).
   **No new table, no new column, no parallel linkage. The architecture is already correct.**
2. **FACTORING STATUS TRUTH-UP — MAINTAIN THE EXISTING COLUMNS, BUILD NOTHING NEW** (§1.3).
   `factoring_status` is canonical. Set `advanced` where Faro bought it; leave `not_factored`
   only for the owner's true 5 / $12,592.40. Populate **`factor_profile_id`** — NULL on all 80
   invoices today. Link the **51 orphan `factoring_advances`**. Three of the true five are
   **missing from the app entirely** (010 Supply Chain Management, 026 IM Specialized,
   074/13593 Alligator) — **report before creating anything.**
3. **RELAY KEY** — declare the USMCA→TRANSP Relay-account mapping **where a live reader already
   reads** (`integrations.relay_company_cards` / `catalogs.fuel_card_types` per CC-3's verdict).
   **Do NOT seed `catalogs.relay_accounts`** — it has zero pipeline readers. No new secret:
   `RELAY_API_KEY_TRANSP` exists. Keep the cross-entity guard; it becomes an explicit declaration.
   Then pull USMCA fuel 2026-09-12..today and close the gap.
4. **RELAY DEPOSIT SYNC** — 2026-09-23 12:00 UTC. Add the deposit endpoint to `relay-client.ts`
   (confirm the path from Relay's docs or Mykael/Ronan — **do not guess a path**), reuse
   `applyRelayDateRangeParams` and `upsertRelayDeposit`, add a **daily cron for all entities**.
   **GL posting stays HELD** (`verify-relay-stage1-no-new-gl-math.mjs` — Part B deferred).
5. **BANKING SUGGESTIONS / JE MEMOS** — 2026-09-23 18:00 UTC. 2,422 of 3,018 memos are machine
   strings; a 539-char commit message renders in a match picker. Memo carries WHO/WHAT/WHICH.
   Payee resolves from linked entities or states why. Backfill changes **no amount, no account,
   no balance**. Guard: `verify-je-memo-is-human-readable.mjs`, baseline 2,422.
6. Dispute **13587** OPEN (proforma $4,000.00 vs Faro $4,120.00).
7. Dispute **13579** OPEN — Faro advanced $5,053.70 against a voided $0.00 invoice;
   **INV-2026-00010 has `factoring_advance_id IS NULL`** and reads self-carried. Closes with item 1.
8. **$428.87 / residual $1,847.24** reserve gap — unexplained. **Do not force a false close**;
   RESERVE REPORT.csv's window does not cover the full held-movement population.
9. A/R gap $80,289.59 → Bucket A $43,160.00 / Bucket B $37,129.59 — **name the invoices**.
10. `INV-2026-00009` draft unsent 10 days — **owner action, escalated, not a code fix.**
11. First `accounting.reconciliation_runs` row; daily close.

---

## 5 · ORDERED QUEUE — CC-3
**Lane:** `settlements/**`, `fuel/**`, `driver-finance/**`, `scripts/alwaystrack/**`.

1. **ALWAYSTRACK FIELD RECONCILIATION — NEW, P0** — 2026-09-23 06:00 UTC. §1.4: truck, trailer,
   trailer_type and W/O are wrong or missing on the four pre-settlement loads, and `trailer_type`
   is `dry_van` on three reefers and a flatbed. AlwaysTrack is the source of truth. Build the
   field-level diff for **every** load, not just these four, and report before writing.
2. **SETTLEMENT + DEDUCTION VOIDS** — wire against CC-1's `voidDocument()` (§6). **Your filed
   nuance is RULED IN, verbatim:** never post a reversal on an already-collected (applied)
   deduction; `voidDocument()` calls `/settlements/:id/reverse` and
   `reverseSettlementBillPaymentInClientTx` rather than reimplementing them.
3. **13533 / 13539 — RULING BELOW, §7. Stays HELD.**
4. **26 unposted expenses / who closes the 7 open settlements** — not started.
5. **13 settlements 5804–5816 blocked** on Step-1 loads; **5812 blocked on load 13600**.
6. **Settlement display-id P0** — every call site mints a synthetic number. Named, not fixed.
7. **IFTA JURISDICTION — NOT UNRESOLVABLE. REOPENED BY THE OWNER, AND HE IS RIGHT.**
   The 118 rows / 12,537.778 gal were declared unresolvable. **The state data exists in three
   places already gathered:**
   - `04-FUEL/09-22-2026-FUEL-CARD-PROVIDER-STATEMENT-0807-0921-PARSED.csv` — **397 Dreamline
     rows with a real `State` column**, plus City, Unit Number, Driver Name, Quantity.
   - `04-FUEL/09-05-2026-LOVES-604-STORES-SEED.csv` — **604 Love's stores, each with `state`**,
     so any Love's transaction resolves by store number.
   - **Every Relay transaction description already carries city and state**:
     `Relay fuel · T176 · Love's · Mandeville, LA`, `Circle K Stores Inc · Hope Mills, NC`.
   Assign the gallons to those states from these sources. **IFTA is GALLON-based, never
   dollar-based; DEF/urea is not a motor fuel.** Report the residual only after all three
   sources are joined — a residual claimed before that is not a residual.
   Fuel linkage 350 no driver → 225 and 92 no unit → 23 accepted. **152/625 `fuel_card_id` NULL**
   stays disclosed.
8. 5815 $308.00 blank-vendor line; stray inactive escrow_contribution (805b072c).
9. `mileage_source` em-dash constraint + the SEAT hard-block gap across 5 write paths.
10. **Amex — STAND DOWN.** Owner deferred it. Name when it resumes: **`Amex-Scentsx`**, verbatim.

---

## 6 · RULING — `voidDocument()` SIGNATURE (final; CC-3 builds against this now)
```ts
voidDocument({
  type: 'bill'|'bill_payment'|'expense'|'invoice'|'payment'
      |'settlement'|'deduction'|'work_order'|'prepaid_expense',
  id: string, reason: string, actor: string,
}): Promise<{ voidedAt: string; reversalJournalEntryId: string | null }>
```
ONE transaction. Stamps `voided_at`/`voided_by`/`void_reason` **and** posts the reversal together.
Throws rather than half-completing. Never edits, never deletes.
**It DELEGATES, it does not reimplement:**
- `settlement` → the existing `/settlements/:id/reverse` engine and
  `reverseSettlementBillPaymentInClientTx`, with its locked/paid preconditions intact.
- `deduction` → the owner-ruled three-branch dispatch. **An already-collected ("applied")
  deduction is NEVER reversed** — *"why would I forgive the debt."*
- everything else → the existing `voidJournalEntry` reversing-entry path.
`reversalJournalEntryId` is `null` ONLY when there was no live posting, and that goes on the
register — never silent.

## 7 · RULING — 13533 / 13539 (CC-3 has held correctly for three rounds)
Two `settlement_lines` ($500.22 / $670.68), `is_active=true`, `is_sample_data=false`, on
TRANSPORTATION-quarantined loads, feeding real net pay ($1,039.05 / $1,273.90) into
S-2026-5786 / S-2026-5788 — **both locked, `paid_at` NULL, nothing blocking payout.**
**RULING: STAYS HELD. No seat touches a locked settlement's net pay.** CC-3 was right to stop
every time. Escalated to the owner as cash risk; it is his release, not a seat's.
Both header JEs carry `source_transaction_type`/`source_transaction_id` **NULL on every line** —
CC-3's finding, and the reason the 207 is a floor.

---

## 8 · LEAD DEBTS — MINE, NAMED
1. **My `bypass_rls` `is_local` law was FALSE.** I cited `catalogs.chart_of_accounts_roles`
   returning 0 rows; **that table does not exist** (it is `accounting.chart_of_accounts_roles`).
   Wrong schema, blamed Postgres, shipped it as law, and carried it out of a session summary
   without re-running it. Measured both ways: **142/142, identical.** All three seats were right.
   **No guard, baseline or ratchet may cite `is_local` as a correctness condition.**
2. **I said the active set was 33.** It is **9** (5 open + 4 pre-settlement). My predicate tested
   only the issued invoice and missed 24 loads settled and driver-billed without an invoice.
3. **I said invoice 13572 was a void-handler defect.** CC-2 proved void-and-reissue across all 38
   voided invoices. My instruction to drive 1150 to $0.00 is **withdrawn**. My *first* answer was
   the right one; my retraction was the error.
4. **I ruled the Relay credit to 8000 intercompany.** Retracted on the owner's correction —
   the wallet is funded by the Amex. Will not be raised again.
5. **I ruled seeding `catalogs.relay_accounts`.** CC-3 proved it has zero pipeline readers.
   Rerouted.
6. **I checked Faro on the load number and reported "not found".** Faro keys on the customer
   reference. The zero was my query, not the data.
7. **I measured self-carried with `factoring_advance_id IS NULL` and ignored `factoring_status`,
   then briefed a rebuild of linkage that already exists.** The owner caught it: *"in the
   invoices table and factoring tables there must be linkage... it should be in the architecture,
   we are regressing, that is not possible."* He is right. The columns exist and work; the
   failure is maintenance, not architecture.
8. **I let IFTA jurisdiction be closed as "unresolvable."** The states were already gathered
   from Dreamline and Relay. Reopened.
9. **OWED RULING, outstanding since 2026-09-13:** the posting contract covers 5 of 6 match types;
   **the gap is SETTLEMENT DISBURSEMENT.** I owe it.
10. **The journal has been stale since 2026-09-12** while I kept issuing instructions — this
   breaks the owner's permanent law. Being corrected in the same round as this register.

---

## 9 · STANDING RULES FOR EVERY SEAT
- **FIND IT, FILE IT, DO NOT FIX IT** outside your lane (§0b). Post to the owning seat's OUTBOX.
- **A DONE with no live proof is not a DONE.** Paste the row, the screen or the query.
- **A guard that was assigned and never written is not a guard** (see §2 — all eight).
- **Empty is a question, not an answer.** Check the entity, the filter, the join, the spelling.
- **Never write test/sample/demo rows into USMCA — including for proof.**
- **Nothing is ever deleted. Every void keeps a register.**
- **Bank matching is SUGGEST-ONLY. A GET must never write.**
- **QuickBooks write-back: never.** `--no-verify`: forbidden, every seat, no exception.
- **A summary of a prior session is memory, not a source, and may never be cited as live proof.**
