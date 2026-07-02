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

## E. CROSS-DOC POINTERS
- Accounting architecture (parallel books / no write-back): `docs/specs/ACCOUNTING-ARCHITECTURE.md` +
  `00_LOCKED_DECISIONS.md` §8.
- Import design corrections: auto-memory `qbo-import-design-corrections`.
- CPA-locked decisions: auto-memory `cpa-locked-decisions-2026-07-01`.
