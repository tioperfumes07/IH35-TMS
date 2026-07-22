# Banking drain — grid-sort (STALE + misfiled) + CONN-1 (deferred to #3135) (2026-07-21)

**Builder role:** Cursor BUILDER. Docs/evidence only — no code, no merge, no Neon-apply.
Base: `origin/main` @ `e2db37a74`.

---

## 1. `banking-grid-sort-resize-rows-per-page` → **STALE (fixed + guarded)** + **MISFILED module**

**Pile audit-note (block-audit-piles-2026-07-21.json):**
> pile=GAP · **module=accounting** · "OPEN: Clickable asc/desc sort on the transaction grid headers
> — every TableHeaderCell instance still hardcodes sortable={false}, matches manifest exactly."

**Misfile:** This is a **banking** item (bank transaction grid), filed under `module=accounting`.
Per the drain instruction (item 5), flagged as a misfile — the module bucket should be `banking`.

**Reality on `origin/main`:**

- The bank transaction grid is the shared `ParityTable`
  (`apps/frontend/src/components/parity/ParityTable.tsx`), **not** the old `TableHeaderCell` markup
  the audit-note describes. `ParityTable` supports controlled/uncontrolled sort via `onSortChange`
  and per-column `sortable`.
- `apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx` declares
  **18** `sortable: true` columns and drives a real sort→group→page pipeline
  (`bankTxnSortGroup.ts`), with resize + rows-per-page.

**Fix history:**
- `2bd6f369b feat(banking): Doc-18 QBO-parity — categorize-capable register (KEYSTONE) (#2371)`
- `b58d7443d fix(ui): Bank Transactions sort/group QBO parity (audit gap #5) (#2597)`

**Guards (both PASS on `e2db37a74`):**
- `scripts/verify-banking-grid-sort-resize-rows-per-page.mjs` — wired at
  `scripts/verify-steps/918-verify-banking-grid-sort-resize-rows-per-page.mjs`
  → `PASS — real sort + ParityTable resize + rows-per-page all locked`
- `scripts/verify-bank-register-sort-group.mjs` — wired via `.github/workflows/locked-guards.yml`
  → `SELFTEST PASS … PASS — wiring + QBO sort/group contract locked`

**Verdict:** STALE (fixed + guarded). The audit-note references a superseded `TableHeaderCell`
surface. Also reclassify `accounting → banking`.

---

## 2. `CONN-1-plaid-reconcile-commit` → **DEFER — already open as HOLD PR #3135**

**Pile audit-note:**
> pile=NEEDS-PROD · module=banking · "backlog-verify UNVERIFIED + needs_live — only a Neon prod
> read can decide."

**Status:** Already covered by open PR **#3135**
(`design/conn-1-plaid-reconcile-commit-hold` — "DESIGN/EVIDENCE HOLD — CONN-1 plaid reconcile-commit
is PENDING(GATED), not a code gap").

Per BUILDER constraints, **no Neon-apply / no prod read** is performed here. This item is
`NEEDS-PROD` (gated on an owner Neon read), not a code gap. **No rebuild** — #3135 owns the verdict.
This PR only records that CONN-1 is already tracked and is intentionally **not** re-implemented in
the banking drain.

---

## 3. Item-5 misfile sweep (banking pile hygiene)

| block_id | filed module | correct module | note |
|---|---|---|---|
| `banking-grid-sort-resize-rows-per-page` | accounting | **banking** | misfiled; also STALE (see §1) |

No other non-banking items were pulled into this drain. No SKIP entries beyond the reclassify above.

---

## Reconciliation action

- `banking-grid-sort-resize-rows-per-page`: `GAP → STALE`, and `module accounting → banking`.
- `CONN-1-plaid-reconcile-commit`: leave `NEEDS-PROD`; owner Neon read via #3135.

No package.json / `locked-guards.yml` / `ci.yml` edits (Rule 17). No new guards. Unmerged (BUILDER).
