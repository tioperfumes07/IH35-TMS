# CURSOR — MASTER WORKLIST (never stop) · 2026-07-26
Your lane: **Accounting · Banking · Maintenance · Factoring · Settlements** + all money-engine/GL/migration work.
Build in this order. When a block is done, pull the next. Every block: guard-first, 8-layer/DoD A–E + VERIFY 1–8,
canonical tables only, reuse poster/no new GL math, HOLD financial PRs for owner gate. Read 00-README first.

## PRIORITY 0 — infra (do FIRST, before the big build push)
- **WORKORDER-branch-rebuild-linear-URGENT.txt** (in this folder). The pre-push gate points every agent at a
  command that reverts merged work. Fix it + guard. Until then use `git cherry-pick`. This protects everything below.

## PRIORITY 1 — already applied on prod → land the matching migration + guard ONLY (do NOT rebuild)
- **SET-02** net-pay clearing: `catalogs.accounts` 2170 "Driver Net-Pay Clearing" (Liability) + role rebound. Migration + `verify-netpay-clearing-is-liability.mjs`.
- **Intercompany accounts (BANK-DOM-05 foundation)**: 8000-block seeded all 3 pairs (TRANSP 8001/8002, TRK 8000/8002, USMCA 8000/8001). Seed migration to match.
- **Revenue posting**: enabled TRANSP+USMCA (Unbilled Revenue 1240/1150 exist). No migration; just don't touch.

## PRIORITY 2 — the module blocks in THIS folder (finish DoD to PASS)
- Factoring (BLOCKS-FACTORING.txt): FACT-02, FACT-03, FACT-05 (FACT-01 SUPERSEDED, FACT-04 owner-seed).
- Settlements (BLOCKS-SETTLEMENTS.txt): SET-01 (retire deprecated poster — urgent), SET-03, SET-04, SET-05 (SET-02 done).
- Maintenance (BLOCKS-MAINTENANCE.txt): MNT-ECON-01/02/04, MNT-LINK-02/04, MNT-ECON-05, MNT-LINK-01/03b.
- Accounting (BLOCKS-ACCOUNTING.txt) + Banking (BLOCKS-BANKING.txt) DOM blocks. NOTE: Accounting-DOM/Banking-DOM are already committed in docs/blocks/class-sweeps — DEDUPE.

## PRIORITY 3 — Phase-2 new-decision blocks (BLOCKS-NEW-DECISIONS.txt in this folder)
Auto invoicing pipeline · full fixed-asset + auto-depreciation register (build now, $7,000 capitalize, Heavy Repair Expense) ·
escrow $2,500 cap · C5 remove driver-chargeback path (company absorbs) · intercompany transfer path (coordinate w/ Claude's BANK-DOM-05).

## PRIORITY 4 — AUDIT BACKLOG (detailed per-block files ARE in this folder → `AUDIT-BACKLOG-ACCOUNTING-BANKING/`)
That folder has the full 8-layer blocks: ACCT-R-01…43, ACCT-ECON-05, BANK-R-01…04, BANK-F08/F09, BANK-SURF-04,
BANK-LINK-01, BANK-ECON-04, plus 00-INDEX/00-DISPATCH-ORDER for build order, COMPLIANCE-STANDARD + VERIFIED-LINKAGE-BACKBONE.
Cross-ref the live registry: `docs/module-completion/accounting.json` + `banking.json` + `docs/trackers/BLOCK-RECONCILIATION-2026-07-26.md`.
Open items to close (these map to the ACCT-R/BANK files above):
- **Accounting (8/28 → close 20):** ACCT-ECON-03/04/05 · ACCT-LINK-01/02/03/04/05/06 · ACCT-SURF-01..09 · ACCT-R-03 · ACCT-R-11.
- **Banking (4/16 → close 12):** BANK-ECON-02/03/04 · BANK-SURF-01..06 · BANK-LINK-01 · BANK-F08 · BANK-F09.
- Full per-item detail (DoD/VERIFY, files, acceptance) lives in the module-completion JSON in the repo — read it there; it's authoritative.

## PRIORITY 5 — gated financial PRs (your build is done; GUARD verifies → owner gates → Devin merges): #3601 ACCT-DOM-02, #3596 BANK-DOM-04, #3602 BANK-DOM-06, #3593 escrow, #3608 BANK-DOM-05.

## PRIORITY 6 — MODULES 7–10 money-side (GUARD live-audited 2026-07-26 — blocks are IN this folder now)
- **Fuel GL (BLOCKS-FUEL.txt):** FUEL-01 ~$620K fuel never GL-posted (re-flush, RE-VERIFY the total first) ·
  FUEL-04 add "Driver Fuel-Overage Receivable" account · FUEL-03 build the overage engine (9 over-cap events) ·
  FUEL-02 money side of load-attribution · FUEL-08 payment-method drives the credit. ALL FIN-HOLD.
- **Insurance GL (BLOCKS-INSURANCE.txt):** INS-01 fleet premium posts to ARBITRARY oldest-2 accounts (role-resolve) ·
  INS-03 refund_obligation.journal_entry_id FK · INS-04 damage-chain claim FK · INS-02 claim-recovery posting. ALL FIN-HOLD.
- Fuel planner/IFTA + Insurance ops linkage are Claude's lane (his folder) — COORDINATE on FUEL-02 (he resolves
  load_id, you post it) and INS-02 (recovery link). Legal + Compliance are Claude's lane entirely.
