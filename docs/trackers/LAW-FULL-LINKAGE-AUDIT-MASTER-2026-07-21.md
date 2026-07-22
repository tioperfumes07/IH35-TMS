# FULL REPO / DEPLOY LINKAGE AUDIT — Law of the Land §9

**Deployed:** `https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version=e64fc4c` (as of audit start 2026-07-21)  
**Standard:** Every money/ops event must appear in **every** module/tab/GL/JE/expense/bill/payment/driver/unit/claim/legal surface it belongs in — **forward + reverse**. “Merged” ≠ done.

**Method:** Audit by **economic path** (not pile STALE). Each path → PASS / FAIL / UNVERIFIED with evidence. Every FAIL → code fix PR. Coder merges + Neon; Cursor builds.

## Deploy vs main

| Ref | SHA | Note |
|---|---|---|
| Live API | `e64fc4c` | healthz shallow |
| `origin/main` | *(refresh each wave)* | must catch up after merges |

## Path register (master)

| Path ID | Economic event | Audit PR / file | Overall | Top FAILs | Fix PRs |
|---|---|---|---|---|---|
| P-EXPENSE | Expense → GL/JE → list/register/vendor/payment | #3166 | **FAIL** | reverse drill | #3170 |
| P-BILL | Vendor bill → bill_lines → AP → payment → JE | #3167 | **FAIL** | 0 bill_lines on Neon | #3172 |
| P-SETTLE | Settlement → pay-run → CoA → JE → escrow | #3168 | **FAIL** | no FE; CoA undesignated; main resolver | #3149 #3171 |
| P-CLAIM-LEGAL | Claim → legal → expense → driver/unit → GL → pay | *(in flight)* | TBD | TBD | TBD |
| P-INVOICE | Load → invoice → AR → payment → JE | TBD | TBD | TBD | TBD |
| P-FACTOR | Factoring advance → liability/reserve → JE | TBD | TBD | TBD | TBD |
| P-FUEL | Fuel txn → expense/GL → unit/driver → JE | TBD | TBD | TBD | TBD |
| P-MAINT | WO → bill/expense → unit → JE | TBD | TBD | TBD | TBD |
| P-SAFETY | Incident/fine → liability/expense → driver → JE | TBD | TBD | TBD | TBD |
| P-BANK | Bank txn → match/categorize → GL → source entity | TBD | TBD | TBD | TBD |
| P-ESCROW | Escrow contribution/release → liability → driver | TBD | TBD | TBD | TBD |
| P-ADVANCE | Cash advance → recovery → settlement → JE | TBD | TBD | TBD | TBD |

## Non-path merged volume (context)

GitHub reports **≥500** merged PRs since 2026-07-10 alone (API page cap). Re-auditing by PR title is how STALE theater failed. **We audit paths + live Neon/UI**, then map merged PRs into paths as evidence — not the reverse.

## Rules for this ledger

1. No “STALE / already on main” as PASS without hop evidence.  
2. LIVE PROOF required for PASS (Neon RLS-bypass + browser or endpoint). Else **UNVERIFIED**.  
3. Fix PRs must include ACCEPTANCE + §9 LINKAGE.  
4. Cursor does not merge.

## Update log

| Date | Change |
|---|---|
| 2026-07-21 | Ledger opened; P-EXPENSE/BILL/SETTLE FAIL documented; claim-legal audit dispatched |
