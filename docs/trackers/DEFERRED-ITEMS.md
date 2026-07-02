# IH35-TMS — Deferred Items Register (canonical)

> One place for everything we consciously deferred, so nothing is forgotten. **Append-only.** When an
> item is done, mark it `[DONE <date>]` — do not delete (history). Last major update: **2026-07-02**.
> Related trackers: `docs/trackers/phase-1.md` Section E (phase backlog), `.block-ready/*.json`,
> `docs/trackers/block-reconciliation-data.json`, and the auto-memory index.

Each item: **what** · **why deferred** · **what unblocks it** · **source**.

---

## A. OPEN OWNER DECISIONS (need Jorge's call — do not decide unilaterally)

1. **factoring_advance JE push under no-write-back.** The `factoring_advance` outbound entity composes a
   QBO **JournalEntry** from `accounting.factoring_advances` (not `journal_entries`, so IMPORT-P0/P0b do
   NOT gate it). Decision: should this TMS→QBO push also be disabled under the parallel-books
   architecture? · unblock: owner ruling · src: PR #1797/#1802, ACCOUNTING-ARCHITECTURE.md "Open owner decisions".
2. **Per-entity push-flag override policy during the parallel window.** `QBO_JE_PUSH_ENABLED` /
   `QBO_ENTITY_PUSH_ENABLED` are per-entity-only (default OFF). Recommendation: keep OFF for every entity
   the whole window; enable only per-entity by explicit owner action. Not yet ratified as policy.
3. **P0b #4 — vendor-linkage QBO vendor creation.** `qbo-vendor-linkage.createQboVendor` pushes a vendor
   to QBO on **driver-create**, and `createDriverWithQboVendor` **hard-requires** the `qbo_vendor_id`
   (throws if absent). Gating it as-is BREAKS driver onboarding. Decision: does driver-create still create
   a QBO vendor under reconcile-only, or make the QBO vendor optional? · src: PR #1802 (deferred with reason).
4. **FIN-2 — /finance landing + subnav unification.** Land `/finance` on the Hub, unify one subnav
   (Hub/Statements/Calculator), keep Overview reachable — ADDITIVE. Needs owner approval (design change).
   · src: SWEEP-FIX-17-27 block / PR #1798 PR-body.
5. **CUST-3 / VEND-4 — dual QBO-sync bookkeeping source of truth.** One truth for customer/vendor sync
   state: backfill the qbo-sync bookkeeping from the archive projection vs retire the parallel counter.
   Interim: banner copy states the true state. · src: SWEEP-FIX-17-27 decisions.
6. **DOCS — required document types per entity type** (drivers/units/customers/vendors) so "Missing
   required" means something. Owner list requested. · src: SWEEP-FIX-17-27 decisions.
7. **FACT-3 — canonical Faro factoring vendor row.** · src: FACT-FIX-1 PR-body.
8. **Opening-conversion report semantics.** Balance-sheet-only 12/31/2023 opening is owner-accepted; the
   TMS report engine must be verified **fiscal-year-close aware** (2023 P&L rolls to RE, excluded from
   2024 P&L). · src: qbo-import-design-corrections memory (R1).

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

- **IMPORT-P0b** entity-push kill-switch — HOLD PR #1802.
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

## E. CROSS-DOC POINTERS
- Accounting architecture (parallel books / no write-back): `docs/specs/ACCOUNTING-ARCHITECTURE.md` +
  `00_LOCKED_DECISIONS.md` §8.
- Import design corrections: auto-memory `qbo-import-design-corrections`.
- CPA-locked decisions: auto-memory `cpa-locked-decisions-2026-07-01`.
