# Settlement engine — owner decisions needed (FOUNDATION-FIRST, 2026-07-21)

Status: **AWAITING JORGE RULING** · Author: builder lane (settlement) · Companion to
`SETTLEMENT-ENGINE-PHASE0-REVERIFY-2026-07-21.md`

Everything buildable without an owner ruling in Priority 2 is built and on HOLD PRs:

| PR | Item | State |
|---|---|---|
| #3070 | Phase 1 — additive idempotency-key schema | HOLD, awaiting JORGE-APPROVED |
| #3073 | Phase 2 — double-pay fix (CAS + FOR UPDATE + event idempotency + rail key), stacked on #3070 | HOLD |
| #3075 | P2c — last 4 payroll RETIRE readers repointed to canonical | HOLD |
| #3077 | P2e — plural dispute routes converged onto `driver_finance.driver_settlement_disputes` | HOLD |

Three items in the Phase 2 checklist **cannot proceed without a ruling**. Each is written with
evidence, options, and a recommendation. All row counts below were re-verified on Neon prod
`br-fancy-credit-akjnd07a` this session under `app.bypass_rls='lucia'` (false-empty rule applied).

---

## DECISION 1 — P2a: auto-deductions as sub-ledger rows vs negative pay lines

**Today:** `settlements/auto-deductions/apply.ts` writes deductions as **negative
`driver_finance.settlement_lines`** (`line_type='auto_deduction'`, dollars).
**Blueprint §1 (ARCHITECTURE-BLUEPRINT-2026-07-05):** “deductions are NOT negative pay lines” —
they belong in the `driver_finance.driver_settlement_deductions` sub-ledger (cents, running
balance, cap interaction with `settlement-deduction-cap.service.ts`).

| Option | Effect |
|---|---|
| **A (blueprint-conform, recommended)** | Repoint apply.ts to insert `driver_settlement_deductions` rows (cents); settlement totals read the sub-ledger; deduction-cap service sees auto-deductions (today it does NOT — cap can be silently exceeded by autos) |
| B (status quo) | Keep negative lines; document deviation in blueprint additions; cap stays blind to autos |

**Why it matters financially:** with Option B the WF deduction cap only counts manual deductions;
an auto-deduction policy can push a driver below the cap floor with no guard. Option A is the fix,
not the patch.

**Blocked work:** P2a repoint PR + cap-interaction test.

---

## DECISION 2 — P2b/P2f: team-splits — two parallel config systems, one broken UI

**Verified this session (all 0 rows on prod):**

| System | Config storage | Ledger | Routes mounted? | UI |
|---|---|---|---|---|
| **A — mdata teams (P5-E3)** | `mdata.driver_teams` (split_method 50_50/60_40/70_30/custom…) | `driver_finance.team_settlement_splits` (canonical, FORCED RLS, per-driver rows, `applied_to_settlement_id` immutability latch) | YES (`driver-team.service.ts`) | Teams UI |
| **B — CLOSURE-6 team-splits (P5-T14)** | `settlements.team_split_configs` + `team_split_load_overrides` (RETIRE namespace) | writes negative/positive `settlement_lines` directly | **NO** — `registerTeamSplitRoutes` never registered in `index.ts` | `TeamSplitConfigPanel` on Drivers page calls `/api/v1/team-splits/configs` → **404 in prod today** (dead backend, live UI) |

Also: `team-splits/apply.ts` (used by the settlement create path) resolves splits from **system B
tables** — which are unreachable for config entry (routes unmounted) — so team splits via that path
can never fire in prod. System A's `computeTeamLoadSplit` writes the canonical ledger but its
splits are not consumed by the plural apply path.

| Option | Effect |
|---|---|
| **A (converge on mdata teams, recommended)** | `apply.ts` resolves from `mdata.driver_teams` (+ per-load override going into `driver_finance.team_settlement_splits` or an additive override column); plural `/api/v1/team-splits/*` endpoints stay (never-delete) but become a facade over `mdata.driver_teams`; RETIRE config tables reach zero readers/writers; `TeamSplitConfigPanel` works again |
| B (mount system B) | Register the CLOSURE-6 routes, keep two parallel team-config stores — permanent double-entry drift risk (same driver pair configured differently in two places), contradicts canonicalization |

**Why it matters:** money-splitting config living in two stores is a guessed-mapping landmine; and
today the Drivers-page panel is a silent 404 (a live defect either way).

**Blocked work:** P2b/P2f repoint PR + guard (`verify-no-settlements-team-split-refs`).

---

## DECISION 3 — P2e residual: p6 driver-dispute table vs canonical dispute table

`#3077` retires `settlements.settlement_disputes` (plural). One dup remains:
`driver_finance.settlement_disputes` (P6-T11185 driver-facing flow: line-level disputes,
free-text `reason_code` ≤80 chars, `evidence_r2_paths`, SLA queue, outbox events
`settlement_dispute.submitted/decided` with handler-parity pins, email + push notifications).

Canonical `driver_finance.driver_settlement_disputes` has a **closed enum** `dispute_category`
CHECK and ≥20-char description CHECK. The p6 flow has **free-text** reason codes and ≥10-char
texts.

| Option | Effect |
|---|---|
| A (full merge) | Additive columns on canonical (`settlement_line_id`, `reason_code`, `evidence_r2_paths`) + status/vocabulary mapping + repoint p6 service + outbox/notification parity. One dispute table for everything. Largest blast radius (outbox handlers, driver mobile contract, SLA queue) |
| B (keep p6 table as the driver-submission ledger, cross-link) | Keep both tables; add FK `driver_finance.settlement_disputes.promoted_dispute_id → driver_settlement_disputes.id`; office review promotes/mirrors into canonical. Smaller blast radius, but two dispute ledgers permanently |
| **C (defer to P3 with tracker entry, recommended)** | Both tables are 0 rows and both flows are canonical-schema (`driver_finance.*`, not a RETIRE namespace). Unification is real work with notification/outbox risk and zero current data risk. Rule 16 deferral condition: named tracker entry + block id (`P3-DISPUTES-UNIFY`) |

**Ask:** if C, confirm the tracker entry; if A or B, rule on the vocabulary (does `dispute_category`
gain the p6 reason codes, or does `reason_code` stay a free-text companion column?).

---

## What the lane does meanwhile (no ruling needed)

- Babysit the four HOLD PRs (rebase-on-main freshness, CI green).
- Priority 4 guard extensions that would go RED on main today (absolute no-RETIRE-write G4) are
  **sequenced after** #3075/#3077 merge — landing them earlier would fail main honestly but
  pointlessly.
- Priority 6 UI lane continues (ParityTable Phase B in flight).
