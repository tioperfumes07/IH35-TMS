# LAW — TRANSACTION HEALTH REGISTER (FULL WIRING)

Owner-ordered 2026-09-01. BINDING. Supersedes the 6-check draft.

## Why this exists

The owner asked why the health endpoint never alerted him that A/R was out by $1,215.75.
Because all **nine** existing checks are infrastructure — `postgres.select1`, `migrations.ledger`,
`redis.ping`, `r2.head_bucket`, `qbo.sync_alerts.unresolved_depth`, `qbo.connections.oauth`,
`email.queue.depth`, `background_jobs.stale`, `sentry.heartbeat`. **Not one is a financial
control.** A system reporting `ok:true` while the books do not tie is reporting that the servers
are up. The owner reasonably assumed it meant the books were right.

`ledger-integrity-detectors.service.ts` and `subledger-gl-control-rec.service.ts` already exist
and are in **no** health path. Wire them in; do not rebuild them.

## Rules for every check

1. **Critical tier.** A red financial check turns `ok:false`, exactly like `postgres.select1`.
2. **Per entity.** Every check runs per `operating_company_id`. A pass on USMCA is not a pass.
3. **Zero is the only pass** for variance checks. "Close" is a fail.
4. **Named in a workflow.** A check that runs nowhere is decoration.
5. **Shadow first.** Anything with a known live violation starts non-blocking, with the current
   count recorded as the baseline, and flips to blocking when it reaches zero.
6. **Every check names its remediation.** A red light with no next action is an alarm nobody can act on.

---

## A · LEDGER INTEGRITY — the foundation

| # | Check | Pass | Live now |
|---|---|---|---|
| A1 | Unbalanced journal entries | 0 | **0 ✓** |
| A2 | Trial balance: total DR = total CR, per entity | equal | unverified |
| A3 | Every JE has ≥2 postings | 0 violations | unverified |
| A4 | Every posting references a live `catalogs.accounts` row | 0 orphans | unverified |
| A5 | Document presenting as posted with zero postings | 0 | **3 ✗** — expense `8a1b3d84` $75.00 · `BILL-2026-00018` $750.00 · `BILL-2026-00019` $300.00 |
| A6 | Posting into a closed period | 0 | 24 periods open — untestable today |

## B · SUBLEDGER TIE-OUTS — GL vs the records behind it

| # | Control account | Subledger | Live now |
|---|---|---|---|
| B1 | 1100 Accounts Receivable | open invoices | **OUT −$1,215.75 ✗** (GL $10,446.25 vs $11,662.00) |
| B2 | 2000 Accounts Payable | open bills | **OUT −$268.77 ✗** (GL $7,460.00 vs $7,728.77) |
| B3 | 1000 / 1090 Bank + Undeposited | `banking.bank_transactions` | unverified — GL 1000 is **−$41,255.43** |
| B4 | 1150 Unbilled Revenue | delivered-not-invoiced loads | unverified — GL holds **$109,158.50** |
| B5 | 2100-* Driver Escrow | `accounting.escrow_accounts` + `escrow_ledger` | unverified |
| B6 | Driver Cash Advance | `driver_advance_accounts` + `driver_advances` | unverified |
| B7 | 1410 Prepaid Expenses | amortization schedule | unverified |
| B8 | Fixed assets | asset register + accumulated depreciation | unverified |
| B9 | Factoring | `factoring_advances` + `factoring.batch` | unverified |
| B10 | 8000-block Intercompany | each pair nets to zero across entities | unverified |

## C · VOID & REVERSAL INTEGRITY

| # | Check | Pass | Live now |
|---|---|---|---|
| C1 | Voided document that had GL has a balanced reversing JE | 0 violations | **0 ✓** (233 of 233 balanced, $173,463.49) |
| C2 | Every voided document has `void_reason`, `voided_by_user_id`, `voided_at` | 0 nulls | **1 ✗** — `INV-2026-00024` |
| C3 | Bank transaction still matched to a voided document | 0 | **5 ✗** — 4 categorized $5,700.00 + 1 pending −$1,200.00 |
| C4 | One void-column convention across the schema | no `revoked_at` / `unapplied_at` / `reversed_at` drift | **✗** — 4 parallel conventions |
| C5 | Reversal posts to the SAME accounts, opposite side, same amounts | 0 mismatches | unverified |

> **C1 note for whoever implements it:** the void path writes a **separate reversing JE**. It does
> NOT populate `reversal_of_line_id` / `reversed_by_line_id`. Asserting on those columns produces
> a false positive — it produced one for me on 17 invoices. Match on the reversal JE.

## D · LINKAGE (Rule 14) — both-way, financial + operational + hub

| # | Check | Live now |
|---|---|---|
| D1 | Every delivered/completed load has a driver bill | **✗ 39 loads, 16 real, $14,789.50** |
| D2 | Every driver bill links to a load | ✓ FK `NOT NULL` enforces it |
| D3 | Every invoice links to its source load (where `invoice_type='from_load'`) | unverified |
| D4 | Every settlement links its lines, and every line its bill | unverified |
| D5 | Every expense/bill links to its operational parent (load · work order · unit · trailer) | unverified |
| D6 | Every load reaching PAID has the full chain: invoice → bill → expense → settlement → factor → bank | **✗ 0 of 19 settlements have EVER reached PAID** |
| D7 | Every insured unit has a `policy_unit` row; premium total = Σ `payment_schedule` | unverified — **0 documents attached to any unit** |

## E · ENTITY INTEGRITY — the highest-cost error class

| # | Check | Live now |
|---|---|---|
| E1 | All postings on one JE share one `operating_company_id` | unverified |
| E2 | No document references a parent in a different entity | unverified |
| E3 | Every financial row carries a non-null `operating_company_id` | unverified |
| E4 | TRANSP / TRK frozen: zero new financial rows | unverified |

## F · DATA HONESTY

| # | Check | Live now |
|---|---|---|
| F1 | `is_sample_data` set explicitly by every create path | **✗** — 17 unflagged expenses, 34 of 49 invoices |
| F2 | No test-named account in `catalogs.accounts` | **✗** — `DRIVERCASHAD896665-023` "Driver Cash Advance- TEST CODEX ONBOARD 20260824", **$1,200.00 on the balance sheet** |
| F3 | No seat instruction text in any memo/notes field | **✗ 4 records** (CC-2's guard, shadow mode) |
| F4 | No financial record created outside an owner-ordered walk manifest | not buildable yet — manifests are prose |

## G · DRIVER & SETTLEMENT

| # | Check | Live now |
|---|---|---|
| G1 | Every driver who moved a load in 2026 has BOTH advance and escrow | **✗ 6 of 14 missing both** |
| G2 | No settlement closes negative without a `driver_liabilities` entry | **✗ 7 negative, none recorded** |
| G3 | Settlement approval state internally consistent | **✗ 47 of 47 stuck at `needs_review`, zero callers** |
| G4 | One person = one financial identity | **✗** `DRIVER-PERSON-IDENTITY-01` — 175 rows / 106 people |

---

## Scoreboard at adoption

**Passing 2 · Failing 13 · Unverified 24**

That is the honest baseline. Every "unverified" is a check nobody has ever run.

## Remediation owners

| Band | Owner |
|---|---|
| A, B | CC-2 builds the checks · CC-1 fixes what they find |
| C | CC-1 (LINKAGE INTEGRITY LAW — match as a record, DB-level trigger, one void convention) |
| D | CC-1 (bill mint, PAID chain) · Cascade enumerates |
| E | Codex (entity-safe by discipline) · CC-2 guards |
| F | CC-2 |
| G | CC-1 · Codex (identity first) |
| Wiring into `/api/v1/healthz` | CURSOR |
