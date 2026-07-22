# Banking remaining disposition — post-wave-1 (2026-07-21)

**Builder role:** Cursor BUILDER. Docs/evidence only — no code, no merge, no Neon-apply.
Base: `origin/main` @ `e2db37a74`. Does **not** touch `#3123` / `#3124` (financial HOLD-FOR-JORGE, owner-only).

**Why this file:** `docs/trackers/block-audit-piles-2026-07-21.json` carries **24** pending banking-pile
items (`GAP` 13 + `NEEDS-PROD` 7 + `NEEDS-OWNER` 4 + `UNVERIFIED` 0 = 24; `by_module.banking`). Wave 1
(`#3131` BANK-18, `#3134` 0285-transfer-GL, `#3135` CONN-1) and the parallel drains `#3136`
(plaid-sign + auto-match STALE) and `#3137` (grid-sort STALE/misfile + CONN-1 defer) already dispose
of 8 of the 24. This file disposes the remaining items that are **not yet covered by any open PR**,
and cross-references the ones that are — so nothing here duplicates other builders' work.

---

## Full 24-item map (banking pile, 2026-07-21)

| # | id | pile | disposition this pass | evidence / owner |
|---|---|---|---|---|
| 1 | `FIX-05-BANKING-SPLIT-ENABLE-AND-WIRE` | NEEDS-OWNER | cross-ref only | `NEEDS-OWNER-ADJUDICATION-2026-07-21.json` — **ANSWERED** (flags ON); buildable_action is real code (Part-2b bill_payment auto-create on accept) — out of scope for a docs pass, tracked in `#3115` |
| 2 | `BANK-18-KEYSTONE-CATEGORIZE-REGISTER` | GAP | in-flight | open PR `#3131` |
| 3 | `CONN-1-plaid-reconcile-commit` | NEEDS-PROD | in-flight | open PR `#3135` (+ `#3137` records the defer) |
| 4 | `CONN-3-relay-internal-bank` | NEEDS-OWNER | **DESIGN HOLD (this pass, PR B)** | §1 below |
| 5 | `phase13-audit216-banking-industry` | NEEDS-OWNER | **DESIGN HOLD note (this pass)** | §2 below |
| 6 | `0010-f15-plaid-amex-wf-error-status` | NEEDS-PROD | already resolved | `NEEDS-PROD-NEON-VERDICTS-2026-07-21.md` #1 — **STALE**, tracked in `#3117` |
| 7 | `0242-no-auto-equipment-log-on-transfer` | GAP | **SKIP — misfile** | §3 below |
| 8 | `0285-banking-transfer-gl-gap_VERIFY` | GAP | in-flight | open PR `#3134` |
| 9 | `0441-mod2-wo-split-brain` | GAP | **misfile, out of scope** | evidence text is `POST /api/v1/work-orders` — maintenance module, not banking; not a Jorge-named item in this dispatch, noted only |
| 10 | `0441-mod6-hos-violations-source-enum-mismatch` | GAP | **misfile, out of scope** | evidence text is `safety.hos_violations.source` — safety module, not banking; noted only |
| 11 | `0441-mod8-auto-match-button-dead` | GAP | already resolved | open PR `#3136` — **STALE**, `#2628` merged |
| 12 | `0441-mod8-plaid-sign-deposits-negative` | GAP | already resolved | open PR `#3136` — **STALE**, `#2667` merged |
| 13 | `0441-mod9-customer-taxonomy-mismatch` | GAP | **misfile, out of scope** | evidence text is `Customers.tsx` vs `CustomerDetail.tsx` tab taxonomy — customers module, not banking; noted only |
| 14 | `0473-2-7-bank-transactions-uncategorized-plaid` | NEEDS-PROD | **STALE-count correction (this pass)** | §4 below |
| 15 | `0518-r09-plaid-amex-wf-error` | NEEDS-PROD | already resolved | `NEEDS-PROD-NEON-VERDICTS-2026-07-21.md` #3 — **STALE** (dedupe of #1), tracked in `#3117` |
| 16 | `0519-bk1-plaid-amex-wf-error` | NEEDS-PROD | already resolved | `NEEDS-PROD-NEON-VERDICTS-2026-07-21.md` #4 — **STALE** (dedupe of #1), tracked in `#3117` |
| 17 | `0519-fl1-2649-bank-tx-uncategorized_DISPATCH` | NEEDS-PROD | **STALE-count correction (this pass)** | §4 below |
| 18 | `banking-2-plaid-connections-error-state` | NEEDS-PROD | already resolved | `NEEDS-PROD-NEON-VERDICTS-2026-07-21.md` #7 — **STALE** (dedupe of #1), tracked in `#3117` |
| 19 | `biz-flow-8-no-equipment-log-auto-update` | GAP | **SKIP — misfile** | §3 below |
| 20 | `fk-equipment-transfer-log-0289` | GAP | **SKIP — misfile** | §3 below |
| 21 | `flow8-equipment-transfer-notifications` | GAP | **SKIP — misfile** | §3 below |
| 22 | `flow8-no-auto-equipment-log-notify` | GAP | **SKIP — misfile** | §3 below |
| 23 | `qbo-parity-resizable-columns-everywhere` | GAP | **STALE-for-banking / misfile (this pass)** | §5 below |
| 24 | `sweepfix1727-8` | NEEDS-OWNER | **DESIGN HOLD note (this pass)** | §6 below |

**Net:** of 24, 3 are in-flight on other open PRs (2, 3, 8), 5 already resolved as STALE on other open
PRs/evidence (6, 11, 12, 15, 16, 18), 3 are out-of-scope misfiles not named in this dispatch (9, 10,
13) noted for the record only, and this pass disposes the remaining **9** items Jorge named
(4, 5, 7, 14, 17, 19, 20, 21, 22 — item 23 folds into the same pass) plus **1** cross-ref (1).

---

## §1. `CONN-3-relay-internal-bank` — see companion PR (design hold)

Dispositioned as a **standalone one-pager** in the companion PR
`design/conn-3-relay-internal-bank-hold` (kept separate per dispatch note "(B) optional CONN-3 DESIGN
HOLD if useful") so the owner can act on it independently of this drain doc. Summary: per
`NEEDS-OWNER-ADJUDICATION-2026-07-21.json` this item is already **ACTION-ONLY** (no open design
question — ingest is real and built, `#2181`; only the wallet-registration migration is held). This
pass's contribution is confirming there is no *design* question left to answer, only an owner-apply
action, and flagging the one open parameter (`account_class`) inside the held migration itself.

---

## §2. `phase13-audit216-banking-industry` — DESIGN HOLD note

**Pile evidence:** `backlog-verify NEEDS-OWNER (owner/CPA ruling required)`.
**Adjudication file question** (`NEEDS-OWNER-ADJUDICATION-2026-07-21.json` id
`phase13-audit216-banking-industry`, verdict `UNANSWERED`):
> "Is a lending-operations / banking-risk-analytics module in scope for IH35-TMS, or explicitly
> out-of-scope?"

**Dispatch-note update:** this dispatch states Jorge's position has moved from an earlier "all OUT"
read to **"I like lending/risk IN actually"**. That is a directional signal, not a written scope
lock — the adjudication file's verdict stays `UNANSWERED` until Jorge confirms scope in writing.
Recording the directional note here (append-only) rather than flipping the verdict on an inference.

**Open questions for Jorge (design-only, no code below this line):**
1. Scope: is "lending/risk" a new banking sub-tab (e.g. a Risk/Underwriting tab alongside Home,
   Transactions, Reconciliation, Plaid Connections, Factoring Virtual, Relay), or a separate module
   entirely (new sidebar item)? Architectural design (`IH35_ARCHITECTURAL_DESIGN.md`) has no banking
   tab named for this today — Rule 05 requires either adding it there in the same commit as any build,
   or an explicit tracker deferral naming the future block.
2. Data source: is this analytics over IH35's *own* receivables/factoring/CCG-financing exposure
   (internal risk), or a forward-looking product to score *customer* credit risk (already partially
   covered by the existing `factor` / `manual` / `rmis_future` credit-limit source model in
   `mdata.customers`)? These are materially different builds.
3. Priority: is this a Phase-3+ item (per `docs/trackers/phase-1.md` §E phase mapping — "Phase 6:
   reporting, scoring, suggestion engines"), or does the new "IN" signal move it earlier?

**Disposition:** DESIGN HOLD — no tracker verdict flip, no code. Owner-in-writing needed before a
dispatch-ready block can be cut (per Rule 01 NEW SPEC gate — this has no matching section in either
blueprint or the architectural design today).

---

## §3. Equipment-transfer items misfiled under `banking` — SKIP (misfile)

| id | pile | evidence excerpt |
|---|---|---|
| `0242-no-auto-equipment-log-on-transfer` | GAP | "`mdata.equipment_transfers` → `mdata.equipment_log` link: `finalizeDualAckTransfer`/`confirmTransfer` never INSERTs into `mdata.equipment_log`…" |
| `biz-flow-8-no-equipment-log-auto-update` | GAP | "`dual-confirm.service.ts` / `request.service.ts` never INSERT into `mdata.equipment_log` on transfer confirm…" |
| `fk-equipment-transfer-log-0289` | GAP | "No FK/column links `dispatch.equipment_transfer_requests` (or `mdata.equipment_transfers`) to `mdata.equipment_log`…" |
| `flow8-equipment-transfer-notifications` | GAP | "No notification wiring (email/SMS/PWA) on transfer initiate/confirm in the current dual-confirm engine." |
| `flow8-no-auto-equipment-log-notify` | GAP | "No auto-insert into `mdata.equipment_log` and no driver notification on transfer confirm, in either the legacy `mdata` engine or the canonical `dispatch` engine." |

**Why these are a banking misfile:** every one of these five items is about the equipment-transfer
dual-confirm flow (`apps/backend/src/dispatch/equipment-transfer/`, `apps/backend/src/mdata/
equipment-transfer.service.ts`) and the `mdata.equipment_log` audit table. None touch
`banking.bank_accounts`, `banking.bank_transactions`, Plaid, Relay, reconciliation, or GL posting —
the actual banking schema/routes. They are dispatch/master-data items (`mdata.equipment_transfers`,
`dispatch.equipment_transfer_requests`) tagged `module: banking` in
`block-audit-piles-2026-07-21.json` in error.

**Disposition:** **SKIP (misfile note only)** — no code change in this pass. Reclassify
`module: banking → module: dispatch` (or `mdata`, matching whichever canonical engine is confirmed
current — see `docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md` §A canonical/RETIRE map)
the next time `block-audit-piles-*.json` is regenerated. These 5 items remain **real, open gaps** —
just not banking-module gaps, and out of this BUILDER's banking-scoped dispatch. They should be
re-dispatched under dispatch/equipment-transfer, not closed.

---

## §4. Uncategorized bank-transaction backlog — STALE-count correction, not a code wire

**Items:** `0473-2-7-bank-transactions-uncategorized-plaid`,
`0519-fl1-2649-bank-tx-uncategorized_DISPATCH` (both `NEEDS-PROD`).

**Already proved live** in `docs/trackers/NEEDS-PROD-NEON-VERDICTS-2026-07-21.md` (§2 and §5, Neon
prod read, `SELECT set_config('app.bypass_rls','lucia',true)` in-transaction, tracked in open PR
`#3117`):

| entity | total_tx | uncategorized (`pending_categorization`) | uncategorized_plaid |
|---|---|---|---|
| TRANSP | 5,599 | 5,598 | 3,991 |
| TRK | 4,695 | 4,695 | 4,695 |
| USMCA | 133 | 131 | 131 |
| **TOTAL** | **10,427** | **10,424** | 8,817 |

**Verdict (confirmed, cross-referenced from `#3117` — not re-run in this pass):** `GAP-CONFIRMED
(operational, count STALE)`. The `0519-fl1` block id's "2,649 uncategorized" premise is stale — the
live number is **10,424**, ~4× the claim. Only 3 transactions have ever been categorized in the
entire table.

**Why this is a DESIGN/OPERATIONAL HOLD, not a BUILDER code task:** the categorize UI, the
categorize API (`POST` categorize routes), and the bank-feed GL posting path
(`BANK_FEED_GL_POSTING_ENABLED=true` on all 3 entities per `#3117` item 9) are already **built and
live**. This is not a "wire it up" gap — it is a data-entry/operations backlog: someone has to click
through and categorize 10,424 rows (or run a bulk-categorization/rules pass). That is an operational
staffing/process decision (who does it, in what order, whether rules-based auto-categorization is
built first to cut the manual count), not a missing code path.

**Disposition:** **STALE-count correction** applied to both block ids (2,649 → 10,424; scope any
future dispatch to the live number) + **operational DESIGN HOLD** (not a code gap — needs an owner
decision on categorization-rules-engine vs. manual clerical pass before any block is cut). No code
in this pass.

---

## §5. `qbo-parity-resizable-columns-everywhere` — STALE-for-banking / misfile

**Pile evidence (`module: banking`):** "OPEN: Customers/Vendors/Drivers list pages (and most of the
remaining 28-module catalog beyond the 9 confirmed files) do not use `TableHeaderCell` sort+resize."

**Reality check:** the evidence text names **Customers/Vendors/Drivers** list pages as the open gap
— not banking. Banking's own transaction grid already has resizable + sortable columns:

- `apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx` — every column
  (`date`, `description`, `driver`, `truck`, `load`, `amount`/`spent`/`received`, `balance`,
  `fromTo`, `customer`, `productService`, `checkNo`, `payee`, `className`, `location`,
  `matchCategorize`, `action`) renders through `<TableHeaderCell columnKey=… />` (shared
  `../../../components/table` primitive with `useTablePref` width persistence), explicitly commented
  `// Resizable columns (QBO parity) — reuses the shared TableHeaderCell/useTablePref pair`.
- The bank-tx grid separately has real sort/group/page (`bankTxnSortGroup.ts`) confirmed STALE+guarded
  in open PR `#3137` (`banking-grid-sort-resize-rows-per-page`).

**Disposition:** for the **banking** module specifically, this item is **STALE** — banking's grid
already meets QBO parity for resize+sort. The item is **misfiled**: its actual open scope
(Customers/Vendors/Drivers + "remaining 28-module catalog") belongs to those modules' pile buckets,
not banking's. Per this dispatch's instruction ("if banking already has resize, STALE; else skip
(global)") — **STALE for banking; SKIP here as a global/cross-module item** to be re-filed under
`module: customers`/`vendors`/`drivers`/`platform` on next pile regeneration. No code in this pass.

---

## §6. `sweepfix1727-8` — DESIGN HOLD note

**Pile evidence:** `backlog-verify NEEDS-OWNER (owner/CPA ruling required)`.
**Adjudication file question** (`NEEDS-OWNER-ADJUDICATION-2026-07-21.json` id `sweepfix1727-8`,
verdict `UNANSWERED`):
> "Should `/finance` land on `FinanceOverviewPage` (current) or the real `/finance/hub`, and should
> the 4-tab vs 5-tab (Calculator) subnav be unified?"

**Disposition:** DESIGN HOLD — this is a routing/navigation-taxonomy decision (which landing page
`/finance` resolves to, and whether the Calculator tab is added to the 4-tab subnav or kept separate),
not a lending/risk-scope question, so Jorge's "lending/risk IN" note from this dispatch does not
resolve it. No open question is answered here; recorded for the owner queue only. No code in this
pass.

---

## Reconciliation actions (for next `block-audit-piles-*.json` regeneration)

- `0242-no-auto-equipment-log-on-transfer`, `biz-flow-8-no-equipment-log-auto-update`,
  `fk-equipment-transfer-log-0289`, `flow8-equipment-transfer-notifications`,
  `flow8-no-auto-equipment-log-notify`: reclassify `module: banking → module: dispatch` (real, open
  gaps — not closed, just correctly bucketed).
- `qbo-parity-resizable-columns-everywhere`: reclassify `module: banking → module: platform` (or
  split per-module); mark banking's own grid sub-scope `STALE`.
- `0473-2-7-bank-transactions-uncategorized-plaid`, `0519-fl1-2649-bank-tx-uncategorized_DISPATCH`:
  correct claimed count 2,649 → live 10,424; keep `NEEDS-PROD`/`GAP-CONFIRMED` (operational, not code).
- `0441-mod2-wo-split-brain`, `0441-mod6-hos-violations-source-enum-mismatch`,
  `0441-mod9-customer-taxonomy-mismatch`: noted as additional banking-bucket misfiles found while
  building this map (maintenance / safety / customers respectively) — **not** actioned by this pass
  (not named in this dispatch); flagged so a future drain doesn't re-audit banking to find them.

No `package.json` / `.github/workflows/locked-guards.yml` / `ci.yml` edits (Rule 17). No new guards.
Unmerged (BUILDER — no merge, no Neon-apply).
