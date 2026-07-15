# Settlement Engine Collapse — PHASE 0 reader/writer inventory (2026-07-15)

**Block B-C.P0** (self-merge). The read-only work-map for the settlement-engine canonical collapse (master
work-order §C). Owner **ratified `driver_finance.*`** as THE engine. Verified against `main @ d99e09e3` by code
read; **prod row-counts are UNVERIFIED here** (need a gated Neon read — §1.5) but the code facts below (write
sites, mounts, column gaps, dead code) are fully repo-verified. Each downstream repoint PR is **financial →
build-and-HOLD**.

## Canonical vs RETIRE (owner-ratified)
| Concept | ✅ CANONICAL (survivor) | ⛔ RETIRE (archive, never DROP) |
|---|---|---|
| Header | `driver_finance.driver_settlements` (DOLLARS numeric) | `payroll.driver_settlements`, `settlement.settlement` |
| Pay lines | `driver_finance.settlement_lines` (DOLLARS numeric) | `payroll.driver_settlement_line_items`, `settlement.settlement_line` |
| Deductions | `driver_finance.driver_settlement_deductions` (CENTS bigint) | negative-line pattern, `settlement.settlement_deduction` |
| Disputes | `driver_finance.driver_settlement_disputes` | `settlements.settlement_disputes`, internal dup `driver_finance.settlement_disputes` |
| Team-split cfg | `driver_finance.team_settlement_splits` | `settlements.team_split_configs`, `settlements.team_split_load_overrides` |
| Create endpoint | `driver-finance/settlements.routes.ts` (index.ts:840) | `payroll/driver-settlement.routes.ts` (index.ts:1038) |

## 1. WRITE-SITES into RETIRE tables (the repoint targets)
| file:line | op | RETIRE table | feature | live? |
|---|---|---|---|---|
| `payroll/driver-settlement.service.ts:330` | INSERT | payroll.driver_settlements | draft create | **LIVE** (mounted 1038) |
| `payroll/driver-settlement.service.ts:361` | INSERT | payroll.driver_settlement_line_items | draft lines | **LIVE** |
| `payroll/driver-settlement.service.ts:626` | UPDATE | payroll.driver_settlements → posted | post→Bill+Payment | **LIVE** |
| `settlements/auto-deductions/apply.ts:58` | INSERT | payroll.driver_settlement_line_items | auto-deduction line | **DEAD** (no caller) |
| `settlements/auto-deductions/apply.ts:94` | UPDATE | payroll.driver_settlements | deduction rollup | **DEAD** |
| `settlements/team-splits/apply.ts:159` | INSERT | payroll.driver_settlement_line_items | team-split legacy branch | **DEAD** |
| `settlements/approval.service.ts:245/292` | UPDATE | settlement.settlement_line | reject/approve line | **DEAD** (route unmounted) |
| `settlements/approval.service.ts:426/445/469` | UPDATE | settlement.settlement | approve/finalize/pdf | **DEAD** |
| `settlements/disputes/disputes.routes.ts:96` | INSERT | settlements.settlement_disputes | file dispute | **LIVE** (mounted 845) |
| `settlements/disputes/disputes.routes.ts:226/271` | UPDATE | settlements.settlement_disputes | review/resolve | **LIVE** |
| `settlements/team-splits/team-splits.routes.ts:105/163/202` | INSERT/UPDATE | settlements.team_split_configs / _load_overrides | split cfg | **DEAD** (route unmounted) |

No `DELETE FROM` any retire table (append-only trigger on payroll — `0233:79-91`).

## 2. Mount status (index.ts) — what actually has an HTTP surface
- **LIVE + mounted:** `registerPayrollDriverSettlementRoutes` (1038 → `POST /payroll/driver-settlements/compute|:id/post`); `registerSettlementsDisputesRoutes` (845, plural RETIRE); canonical `registerDriverFinanceSettlementRoutes` (840) + `registerSettlementDisputeRoutes` (846, canonical).
- **LIVE reader on RETIRE:** `pre-settlements.routes.ts:77-91` (`registerC1PreSettlementsRoutes`, 842) still SELECTs `settlement.settlement/_line/_deduction` — despite its own header saying it must not.
- **DEAD (never imported/mounted):** `settlements/approval.routes.ts` (whole D1 approval workspace) and `settlements/team-splits/team-splits.routes.ts`. `settlements/auto-deductions/apply.ts` + `team-splits/apply.ts` have **zero non-test callers**.

**Implication:** only **2** retire namespaces carry a live mounted surface — `payroll.*` (Engine A) and
`settlements.settlement_disputes`. `settlement.*` (singular) has a live *reader* but dead *writer*;
`settlements.team_split_*` is fully dead. That narrows the risky repoints to Engine A + disputes.

## 3. Phase-1 additive-migration column gap (BUILD before any approval repoint)
Canonical `driver_finance.settlement_lines` (10 cols) LACKS these columns that `settlement.settlement_line`
(28 cols, approval flow) uses — add ADDITIVELY (IF NOT EXISTS, FORCED RLS, GRANTs, idempotent) or approval
state is silently dropped on repoint:
`load_id, operating_company_id, source_table, source_reference_id, is_active, updated_at, approval_status,
approved_at, approved_by, rejected_at, rejected_by, rejection_reason, driver_visible, disputed, disputed_at,
disputed_by, dispute_reason, dispute_resolved_at, dispute_resolved_by, category, source_type, source_id`.
Header `driver_finance.driver_settlements` lacks `approved_at/approved_by/finalized_at/pdf_generated_at/
pdf_generated_by` (its own status enum covers some semantics but not the PDF-gen actor/timestamp).
**Also missing: `split_partner_driver_id`** on `driver_finance.settlement_lines` — `team-splits/apply.ts:149-153`
INSERTs it but it was only ever added to `payroll.driver_settlement_line_items`; that INSERT would **500** if
run (masked today — no caller). Add it in Phase 1 before wiring team-splits live.

## 4. UNIT-CONVERSION trap (100× risk — acceptance gate on every repoint)
Header + `settlement_lines.amount` = DOLLARS `numeric(14,2)`; `driver_settlement_deductions.amount_cents` =
CENTS `bigint`; `payroll.*` = all cents. Repoint conversions:
- payroll cents → `settlement_lines.amount` = **÷100**; payroll deduction cents → deduction sub-ledger **stays cents**.
- The two dead functions already convert correctly (`auto-deductions/apply.ts:153-191` ÷100; `team-splits/apply.ts:149-153` ÷100; PDF renderer dual-path `/100.0` for payroll, raw for canonical). Re-verify on resurrection.

## 5. G4 guard gap (fold into Phase 4)
`scripts/verify-canonical-table-writes.mjs` (G4) enforces "no new write" for `payroll.\w+` and `settlement.\w+`
(singular) but its RETIRE pattern array has **no `settlements.\w+` (plural)** entry — so
`settlements.settlement_disputes / team_split_configs / team_split_load_overrides` writes are **currently
unguarded**. Add a `settlements\.\w+` pattern in Phase 4.

## 6. Zero-row window (the reason to do this NOW)
No migration or `scripts/*.mjs` seeds any of `payroll.*` / `settlement.*` / `settlements.*` (grep clean), and 2
of 4 writer paths are dead code. Consistent with the "all four namespaces 0 rows" claim — but **actual prod
counts remain UNVERIFIED** (need a gated Neon read for `payroll.driver_settlements` + `settlements.settlement_disputes`,
the two live-writable ones). If confirmed 0, the collapse is a pure code repoint with no data migration — do it
before the first settlement posts.

## Bonus finding
A related HELD migration already exists unrun: `db/migrations/202607110220_escrow_ledger_repoint_fk_to_canonical.sql`
(repoints `driver_finance.escrow_ledger` FKs off `settlement.settlement/_line` onto canonical). Sequence it with
Phase 1/2 (owner-applied on Neon).

---
**Next:** Phase 1 = the additive-columns migration (§3) — **build-and-HOLD**, owner reviews SQL + applies on Neon,
GUARD re-proofs. Then Phase 2 repoints (one PR per feature), Phase 3 archive, Phase 4 G4 + route-mount guard.
Never a mega-PR; if a canonical target can't hold a retire field, STOP and surface it.
