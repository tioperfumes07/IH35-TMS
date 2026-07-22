# LAW-E2E — Escrow Liability Sub-Account → Contribution/Release → Driver → JE (2026-07-21)

**BLOCK:** `LAW-E2E-ESCROW-DRIVER-LINKAGE-2026-07-21`  
**MODULE:** banking / accounting escrow / driver_finance / settlements  
**WORKTREE:** `/private/tmp/ih35-law-e2e-batch3-20260721-204927` · branch `audit/law-e2e-batch3-money-ops-2026-07-21`  
**BASE:** `origin/main` @ `e64fc4c6b`  
**DEPLOY:** `version=e64fc4c`  
**Neon:** `tiny-field-89581227` / `br-fancy-credit-akjnd07a` · READ ONLY  
**Discipline:** NEVER merge · NEVER Neon-apply · no STALE theater

Law §9: driver escrow is a **liability held in trust** — every contribution/release must hit the **per-driver liability sub-account**, ledger, JE, and reverse drill (never Faro factor reserve asset).

---

## Verdict (one line)

**FAIL overall.** Liability CoA accounts named “Damage Claim Escrow” exist, and code has a correct **per-driver bridge** design (`accounting.escrow_accounts` + Faro assert) — but Neon has **0 escrow bridges**, **0 escrow_postings**, **0 driver_finance escrow ledger/balances**, missing **`escrow_liability_default` / `cash_clearing` CoA roles**, and settlement escrow contribution would fail-loud on unbound drivers.

---

## Spec / standards anchors

| Source | Relevance |
|---|---|
| Blueprint / CPA skill | Driver escrow = liability (not factor reserve) |
| QuickBooks | Sub-customer / sub-account liability + JE |
| UST 425C | Virtual escrow bank excluded from main bank totals |

---

## Live flag state

| Flag | Default | Overrides ON |
|---|---|---|
| `SETTLEMENT_GL_POSTING_ENABLED` | false | TRANSP · TRK · USMCA |
| `DRIVER_ESCROW_SEPARATION_RETURN_ENABLED` | false | TRANSP · USMCA |

---

## Neon row evidence (`app.bypass_rls='lucia'`)

| Relation / metric | Count | Implication |
|---|---:|---|
| `accounting.escrow_accounts` (driver bridges) | **0** | Pay-run `resolveDriverEscrowLiabilityAccount` → `DRIVER_ESCROW_ACCOUNT_UNBOUND` |
| `accounting.escrow_postings` | **0** | No deposit/release JE links |
| `driver_finance.escrow_balances` | **0** | No running balance |
| `driver_finance.escrow_ledger` | **0** | No contribution history |
| `chart_of_accounts_roles` `escrow_liability_default` | **0** | Manual openEscrow cannot resolve role |
| `chart_of_accounts_roles` `cash_clearing` | **0** | Escrow deposit/release JE cash leg unbound |
| Liability accounts named `%Escrow%` (CoA) | 6 liability + 1 Faro **asset** | Accounts exist; **not bridged per driver** |
| Faro `qbo_account_id=1150040084` | present (Asset) | Correctly excluded by resolver assert — if bridge mis-points, fails loud |

---

## Dual-surface map (important — not STALE, real architecture)

| Surface | Table | Role |
|---|---|---|
| Accounting Escrow module | `accounting.escrow_accounts` + `escrow_postings` | Open holder account; deposit/release posts JE via `createJournalEntry`; UI EntityLink driver + JE (`EscrowPage.tsx`) |
| Settlement I3 contribution | Same bridge `escrow_accounts` for CoA id + `driver_finance.escrow_ledger/balances` for running $2k cap | Pay-run **contributes** only (never releases) |
| Safety Escrow Record tab | Safety UI forfeit / record | Parallel ops surface; must not invent a third GL math |
| Banking Driver Escrow tile | Banking home | Virtual bank visibility (425C) |

Silence between these surfaces (0 bridges) = §9 defect.

---

## Hop matrix (PASS / FAIL / UNVERIFIED)

| # | Hop | Verdict | Evidence |
|---|---|---|---|
| 1 | **Per-driver liability sub-account exists** | **FAIL** (bridge) · **PASS** (shared CoA names) | Shared “Damage Claim Escrow” Liability rows exist; **0** `accounting.escrow_accounts` bridges. Provisioner `upsertDriverEscrowAccountLink` not proven live. |
| 2 | **Open escrow account** (`openEscrow`) | **FAIL** (role) | Needs `resolveRoleAccount(..., 'escrow_liability_default')` — role **not designated** on Neon. |
| 3 | **Deposit / release → JE** (`postEscrowTransaction`) | **PASS** (repo) · **FAIL** (live + roles) | Balanced JE cash ↔ liability; `linked_journal_entry_id` on posting. Needs `cash_clearing` + escrow account. Live postings=0. |
| 4 | **Settlement contribution → Cr driver escrow liability** | **PASS** (repo design) · **FAIL** (live bridge) | `resolveDriverEscrowLiabilityAccount` + Faro assert; would throw UNBOUND for every driver today. |
| 5 | **Contribution → `escrow_ledger` / `escrow_balances`** | **PASS** (repo) · **FAIL** (live) | `recordEscrowContribution` upserts balance + `hold` ledger row. Live 0. |
| 6 | **Settlement_id on escrow ledger** | **FAIL** (known hold) | Code omits settlement FK because migration to canonical `driver_settlements` still HELD; linkage only via JE audit / description. |
| 7 | **Release / separation return** | **PASS** (repo gated) · **UNVERIFIED** (live) | Separation flag ON for some entities; no live release rows. |
| 8 | **Reverse: Escrow page → driver + JE** | **PASS** (UI) | `EscrowPage` EntityLinks. |
| 9 | **Reverse: Safety Escrow Record → liability** | **PARTIAL** | Optional linked liability id on forfeit; not JE. |
| 10 | **Never credit Faro reserve as driver escrow** | **PASS** (repo assert) · **UNVERIFIED** (live mis-bridge) | `FARO_FACTORING_RESERVE_QBO_ID` hard fail. |

---

## Ranked CODE fixes

1. **P0 — Provision per-driver escrow bridges on entity** (owner Neon-apply + code ensure-on-hire)  
   Every active driver must have `accounting.escrow_accounts` row (`holder_type='driver'`) pointing at a **Liability** sub-account (not Faro). Guard: settlement close cannot UNBOUND.

2. **P0 — Designate CoA roles** (owner)  
   `escrow_liability_default`, `cash_clearing`, plus settlement roles. Without them, Accounting Escrow deposit/release and openEscrow fail closed.

3. **P0 — Align settlement pay-run role resolver with primary CoA**  
   Same defect as cash-advance audit: pay-run must not depend solely on empty `catalogs.account_role_bindings`.

4. **P1 — Land canonical settlement FK on escrow ledger**  
   Finish held migration so `escrow_ledger.settlement_id` / balances `last_settlement_id` point at `driver_finance.driver_settlements` (void-not-delete, additive).

5. **P1 — Live E2E**  
   Open bridge → deposit $X → JE → settlement contribution → ledger balance → reverse EntityLinks. Until then **UNVERIFIED**.

6. **P2 — Single operator narrative**  
   Document which UI is source of truth for contribution vs release (Accounting Escrow vs Safety tab vs Banking tile) without deleting any surface (Rule 07).

---

## §9 checklist

| Box | Status |
|---|---|
| Money → liability GL + audit | **FAIL** live |
| Money → driver | Bridge **FAIL**; UI link **PASS** |
| Forward + reverse | UI **PASS**; live rows **FAIL** |
| RLS + audit | **PASS** patterns |
| No unwired / wrong account | Faro guard **PASS**; unbound bridges **FAIL** |

**REMAINING:** P0 bridges + CoA roles + live JE. No Neon-apply in this PR.
