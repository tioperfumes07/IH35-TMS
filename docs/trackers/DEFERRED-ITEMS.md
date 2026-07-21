# IH35-TMS — Deferred Items Register (canonical)

> One place for everything we consciously deferred, so nothing is forgotten. **Append-only.** When an
> item is done, mark it `[DONE <date>]` — do not delete (history). Last major update: **2026-07-02**.
> Related trackers: `docs/trackers/phase-1.md` Section E (phase backlog), `.block-ready/*.json`,
> `docs/trackers/block-reconciliation-data.json`, and the auto-memory index.

Each item: **what** · **why deferred** · **what unblocks it** · **source**.

---

## A. OWNER DECISIONS — ★ ALL 8 LOCKED 2026-07-02 (PR #1801 / ACCOUNTING-ARCHITECTURE.md "Locked owner decisions")

Kept for history (append-only). Each now carries its resolution. Items whose resolution is itself a build
are pointed to Section C.

1. **factoring_advance JE push** → **LOCKED: GATED OFF** — folded into the JE kill-switch
   (`QBO_JE_PUSH_ENABLED`, default OFF) in `syncEntityToQbo` + static guard. Shipped in IMPORT-P0b
   (#1802, MERGED+DEPLOYED). Booked in QBO via bank feed + reconciled, never pushed.
2. **Per-entity push-flag policy** → **LOCKED: OFF for ALL entities, EVENT-gated** (cutover ceremony, not a
   date — 12/31/2025 has passed). Enable only per-entity by explicit owner action post-cutover.
3. **Driver→QBO vendor creation** → **LOCKED: best-effort, no synchronous create** — `createDriverWithQboVendor`
   made best-effort (SHIPPED #1804, DEPLOYED); driver onboarding never blocks on QBO; the daily reconcile
   links the vendor (MD-2).
4. **FIN-2 finance landing** → **LOCKED: APPROVED + BUILT** — land on Hub, unified subnav, Overview kept as a
   tab; FIN-1 honest period KPI in same PR (#1805).
5. **CUST-3/VEND-4 sync bookkeeping** → **LOCKED: retire the parallel counter** — archive projection +
   reconciliation exceptions are the only truth. Build tracked in Section C (retire-counter / reconcile-only
   panel).
6. **Required document types** → **LOCKED: FMCSA/IRS regulatory-default matrix, warn-first, per-carrier
   configurable** — spec #1806 (`docs/specs/REQUIRED-DOCUMENT-TYPES.md`). Build tracked in Section C (DOC-REQ).
7. **Canonical Faro vendor row** → **LOCKED: `3585f27e` canonical, merge terms from `6dd1f7f5`, repoint FKs,
   VOID dup.** Read-only diagnostic + owner ceremony plan shipped (#1807). Execution = owner's hand (Section B/C).
8. **Opening-conversion semantics** → **LOCKED: BS-only opening + a MANDATORY RE-roll boundary tieout test in
   IMPORT-4v2** (assert the engine reproduces QBO's Retained-Earnings roll to the cent on a Neon branch).

## B. HARD PREREQUISITES / CONTRACTS (must be done before the dependent work runs)

1. **MD-1/MD-2 explicit origin/source column.** REQUIRED before `QBO_ENTITY_PUSH_ENABLED` is ever turned
   ON — masterdata LAYER-2 origin is currently an approximate `qbo_*_id`-presence heuristic that
   over-refuses updates. · src: PR #1802 contract.
2. **`source_system` CHECK = ('tms','qbo') only.** `'qbo_import'` is not permitted. IMPORT-2v2 must decide:
   import rows use `source_system='qbo'` + a distinguishing `source`, OR ALTER the CHECK (gated). · src: PR #1797.
3. **Kill-switches merged + prod-verified before ANY clone/import RUN.** IMPORT-P0 (JE, merged #1797) +
   IMPORT-P0b (entity, PR #1802) must be live with the flag rows verified OFF. · src: import program v2.
4. **Finance-review must-fix for IMPORT-3v2/4v2:** signed-ACTUAL opening JE (not "natural side"); match
   DEACTIVATED accounts (1100/2000/escrow); multicurrency home-currency + FX accounts; leaf-level /
   signed / void-excluded / UNION tieout; re-run-forward orchestration. · src: qbo-import-design-corrections memory.
5. **`SKIP_MIGRATION_VERIFICATION=true` in prod** → independently confirm each migration actually applied
   (ledger/health) before dependent runs; boot won't refuse on a missing migration. · src: prod-env-integration-facts memory.

## C. GATED / HOLD BUILDS (specced or built behind OFF flags — awaiting JORGE-APPROVED / go)

- **Owner-Operator settlement engine (future — IH35 has no owner-operators today).** The
  `owner_operator_lease_agreement` FMCSA-Part-376 legal template is registered (design/template only,
  no posting code). When owner-operators are onboarded, the settlement engine differs from the
  existing hired-driver path: (1) owner-operator pay posts to **Purchased Transportation** expense,
  NOT the "Cost of Labor–Mexico Drivers" Contract-Labor account used for hired drivers; (2) the truck
  is the **owner-operator's own asset**, not TRK's (no TRK depreciation/lease-income entry); (3) the
  Part-376 escrow/maintenance-reserve fund must be returned **no later than 45 days** after
  termination, with quarterly interest at ≥ the 91-day T-bill yield and an itemized accounting —
  same escrow-liability shape as driver escrow but a distinct FMCSA-mandated deadline. Build-and-hold
  only when owner-operators are actually onboarded; never build posting logic solo.
- **IMPORT-P0b** entity-push kill-switch — ✅ MERGED + DEPLOYED (#1802, prod 06b0975); flag
  `QBO_ENTITY_PUSH_ENABLED` seeded default OFF. factoring_advance folded into the JE gate (decision #1).
- **DOC-REQ (required documents, decision #6):** DOC-REQ-1 (migration: `compliance.required_document_types`
  catalog + FORCED RLS + grants + FMCSA/IRS seed — Tier-1 HOLD, Jorge merges) → DOC-REQ-2 (read-only
  `resolveMissingRequired` + "Missing required: N" chip + per-type warn⇄hard-block config, Tier-3 ships on
  green) → DOC-REQ-3 (per-surface hard-block gate, owner-approved per gate). Spec: REQUIRED-DOCUMENT-TYPES.md (#1806).
- **Retire sync counter (decision #5):** replace the customer/vendor "Synced X of Y / Sync now" panel counter
  with archive-projection + reconciliation-exceptions truth (reconcile-only framing) — aligns the UI with the
  parallel-books lock. Non-financial UI+read build. (Recon in progress 2026-07-02.)
- **Faro vendor dedupe (decision #7):** read-only diagnostic + owner ceremony plan shipped (#1807); the
  merge/repoint/VOID execution is owner's hand against a gated connection.
- **QBO-IMPORT GL program:** IMPORT-1v2 (TRK 917-acct COA + equity, Tier-2), IMPORT-2v2 (schema),
  IMPORT-3v2 (opening BS engine), IMPORT-4v2 (GL detail) — build-and-hold. IMPORT-0 (client) merged #1796.
- **Clone program (QBO-CLONE-PROGRAM.md / PR #1799):** MD-1 customers, MD-2 vendors, MD-3 AR/AP schema,
  MD-4 AR engine, MD-5 AP engine, MD-6 customer/vendor transaction tabs, MD-RECON — specced, not built.
- **RECON-01** (reconciliation engine + jobs) / **RECON-02** (UI) — gated behind `TMS_QBO_RECON_ENABLED`.
- **Factoring:** poster R1/R4 ledger-correctness (HOLD), FACT-FIX-1 (queued), FACT-PAR-1 submission
  workflow, FACT-PAR-2 NOA/remit-to.
- **Parity:** CUSTVEND-PAR-1 (credit-limit enforcement + vendor credits), RPT-PAR-1 (management packages +
  drilldowns), USERS-PAR-1 (QBO Advanced action-level roles — design doc only).
- **Money-posting flags — all OFF until engine built + CPA + Neon:** `SETTLEMENT_GL_POSTING_ENABLED`
  (FIN-18), `LEASE_GL_POSTING_ENABLED` (FIN-22), `AMORTIZATION_GL_POSTING_ENABLED` (FIN-21), and the other
  `*_GL_POSTING_ENABLED`. Flipping any = Tier-1, never self-merged. · src: 00_LOCKED_DECISIONS §6.5.

## D. TECHNICAL DEBT / LATENT (known, not yet breaking — mostly USMCA-July-2026 risk)

1. **`safety.safety_settings` has no INSERT RLS policy** (+ not FORCE) → creating a company as `ih35_app`
   500s at the org.companies trigger. Risks USMCA launch + bootstrapCarrier. Fix = gated INSERT policy or
   SECURITY DEFINER trigger. · src: safety-settings-no-insert-policy memory.
2. **`events` schema USAGE grant gap** — `ih35_app` missing `USAGE` on schema `events` → schema-qualified
   `events.log_event` 500s "permission denied". Fix = gated GRANT USAGE migration. · src: events-schema-usage-grant-gap memory.
3. **Cross-entity leak — ~16 endpoints** blend data across entities (`mdata.*`/`catalogs.*` RLS is role-,
   not entity-scoped); masked today, breaks at USMCA July 2026. Worst = qbo-sync chart-of-accounts
   reconciler. · src: cross-entity-leak-audit-usmca memory.
4. **USMCA Plaid manual-Sync 500** — get the exact error before fixing. · src: resume-state memory.
5. **Block-19 audit hash-chain verification layer** — write-path (prev_hash/hash chaining) is built + CI-
   guarded; the verify/sign layer (chain-verify cron + `ops.audit_chain_verifications` + sequence_number)
   remains. Non-financial but needs a migration. · src: block19-audit-hash-chain-gap memory.
6. **Render env cleanup:** the six `TMS_*_PUSH_HANDLER_ENABLED` env vars are now inert (P0b neutralized
   canHandle); `QBO_{ACCOUNTS,CUSTOMERS,VENDORS}_PUSH_SCHEDULER_ENABLED` are now redundant with the flag
   gate. Clean up in Render. · src: PR #1802.
7. **Prod migration-deployment drift** — prod schema ≠ `db/migrations` at scale (missing_count ≈ 136);
   fix via new idempotent CREATE-IF-NOT-EXISTS migrations. · src: prod-migration-deployment-drift memory.
8. **Post-merge forensics** for #1797 (deploy + flag-row), #1795, #1794 — confirm deploy-live + Neon flag
   rows. · src: prior-session handoff.
9. **False-empty list sweep (TBL-STANDARD)** — LIST-EMPTY-1 fixed Vendors/Customers (shared list-state
   primitive; empty only on a settled query) + a regression guard (`verify:list-empty-settled`). 65 other
   paged-list surfaces still gate empty on bare `data.length===0` and are candidate false-empty flashes;
   migrate in follow-on TBL-STANDARD blocks. Full file list: `docs/trackers/TBL-STANDARD-list-empty-offenders.md`. · src: BLOCK LIST-EMPTY-1.

## E. CROSS-DOC POINTERS
- Accounting architecture (parallel books / no write-back): `docs/specs/ACCOUNTING-ARCHITECTURE.md` +
  `00_LOCKED_DECISIONS.md` §8.
- Import design corrections: auto-memory `qbo-import-design-corrections`.
- CPA-locked decisions: auto-memory `cpa-locked-decisions-2026-07-01`.

---

## F. VERIFY-BLOCK FINDINGS (2026-07-11 sequence run)

- **P4-08 WO→bill double-bill risk** [OWNER-GATED] · **what:** `maintenance/two-section-service.autoCreateBillFromWO`
  does an *unconditional* `INSERT accounting.bills` (no existing-bill guard), while
  `accounting/maintenance-posting/poster.service.processMaintenanceWorkOrderClose` reuses via a SELECT-existing
  guard — but the two run in *separate transactions/clients* (SELECT-then-INSERT race), and
  `idx_bills_linked_work_order_uuid` is **non-UNIQUE**, so nothing DB-enforced prevents two bills for one WO
  under concurrency. **why deferred:** root-cause fix = a `UNIQUE(linked_work_order_uuid)` partial index, which
  is a **financial Tier-1 migration** AND requires a live prod duplicate-count first (a UNIQUE index won't build
  if dups already exist) — both owner-gated (§1.4 + §1.5). **what unblocks it:** Jorge OKs (a) a prod
  `SELECT linked_work_order_uuid, count(*) ... GROUP BY 1 HAVING count(*)>1` check, then (b) collapse to the
  poster as the single canonical path + add the UNIQUE partial index via held migration + Neon ceremony.
  **source:** MASTER 6 · 04-PHASE4 · P4-08_WO-DOUBLE-BILL_VERIFY.

## G. GUARD/MERGER FINDINGS (2026-07-21 merge wave)

- **WC-REIMB weekly-close omits contract terms / reimbursements / fine passthrough** [OWNER-GATED] ·
  **what:** `driver-finance/weekly-close.routes.ts` (post-#3107, live on prod) now applies **deductions**
  correctly — it gates `applyPendingDeductionsToSettlementWithNetFloor` behind the per-entity
  `SETTLEMENT_DEDUCTION_APPLY_ENABLED` flag and lets `aggregateSettlementTotals` recompute totals from the
  lines. But it never runs the **contract-terms** leg. The canonical load-bookended close does:
  `settlements-load-bookended.service.ts:7,325-328` imports `computeSettlementContractTerms` and calls it
  under `SETTLEMENT_CONTRACT_TERMS_FLAG`, and that function internally computes **fine passthrough +
  reimbursements** (`settlement-contract-terms.service.ts:761-770`). Verified 2026-07-21: weekly-close has
  **zero** references to `settlement-contract-terms` or reimbursements.
  **why it matters:** the two legs fail in OPPOSITE directions. #3107 closed the *overpay* landmine
  (deductions ignored → driver paid gross). This remaining leg is an *underpay* risk — a driver owed
  reimbursements is drafted without them. Underpayment of a contractor is the harder defect to detect,
  because nobody reconciles a check that is too small as eagerly as one that is too large.
  **why deferred:** the fix is driver-pay logic (financial cluster, §1.4 — never authored solo by an agent).
  PR #3108 attempted it but was written against pre-#3107 `main`; rebasing produced **12 conflict hunks
  across two competing implementations** of the same settlement function, so it was closed unmerged rather
  than hand-composed. **NOTE:** closing #3108 removed the only in-flight fix for this gap — it is recorded
  here so it is not silently dropped.
  **what unblocks it:** a small ADDITIVE change on top of current `main` that calls the existing
  `computeSettlementContractTerms` under `SETTLEMENT_CONTRACT_TERMS_FLAG` before
  `aggregateSettlementTotals`, mirroring the canonical load-bookended close exactly (reuse only — no new
  math), plus a guard pinning it; then Jorge's `JORGE-APPROVED`.
  **source:** GUARD/merger review during the 2026-07-21 merge wave (#3107 merged + live-verified at
  `18bd5e40c`; #3108 closed unmerged 22:44Z).

- **NPF-DUP net-pay floor has multiple independent sources** [OWNER-GATED] ·
  **what:** locked decision §9.2 requires "**one** floor resolver, **one** config source, default 5%,
  overridable". Verified 2026-07-21 that `DEFAULT_NET_PAY_FLOOR_PCT = 0.05` is declared **independently** in
  BOTH `accounting/settlement-posting/settlement-posting.math.ts:14` and
  `accounting/settlement-posting/settlement-bill-payment.math.ts:20` — neither imports the other — alongside
  DB column defaults on `mdata.drivers` / `org.companies.min_net_settlement_pct`. No CI guard pins them
  equal (`grep DEFAULT_NET_PAY_FLOOR_PCT scripts/` returns nothing).
  **why it matters:** the net-pay floor is the control that stops a driver's check being over-deducted.
  Changing it in one module silently leaves the other at the old value, so the settlement path and the
  bill-payment posting path can enforce **two different floors for the same driver** — a split-brain
  financial control (§9.2 "one config source", LINKAGE-LAW C2 "no duplicate/split-brain"). LATENT today:
  both read `0.05`, so no driver is currently mispaid.
  **what unblocks it:** collapse to one exported constant + the existing clamping resolver in
  `settlement-posting.math.ts`, have `settlement-bill-payment.math.ts` import it, add a guard asserting a
  single declaration repo-wide; financial-cluster → Jorge's `JORGE-APPROVED`.
  **source:** GUARD/merger post-merge verification of #3107 against locked decisions §9.2/§9.3.
