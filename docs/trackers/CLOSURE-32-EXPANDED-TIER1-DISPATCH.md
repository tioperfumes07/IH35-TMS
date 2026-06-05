# CLOSURE-32 EXPANDED — TIER-1 Audit Spec (Multi-Tenant Isolation)

**Status:** REVIEW-READY SPEC ONLY — NOT DISPATCHED
**Type:** Read-only forensic audit (no writes, no auto-fix, no migrations)
**Depends on:** CLOSURE V2 wave complete; runs BEFORE PASS-8-RUNTIME
**Tenants in scope:** `TRK` (IH 35 Trucking), `TRANSP` (IH 35 Transportation), `USMCA` (pre-launch, inactive)
**Scope key:** `app.operating_company_id` per `docs/specs/MULTI-CARRIER-ISOLATION.md`

---

## 0. Hard Constraints

- **READ-ONLY.** No `INSERT/UPDATE/DELETE/DDL`, no migrations, no PR, no auto-fix.
- All queries run in explicit read transactions; no session var mutation beyond `SET LOCAL` for the role being simulated.
- Any remediation is **proposal only** → **PING JORGE** before any cleanup decision (see §6).
- Audit must be re-runnable and produce identical output on a static DB.

---

## 0a. TRK Operating Company UUID Discovery (run FIRST)

Before any RLS probe, CLOSURE-32 MUST first run:

```sql
SELECT uuid, name FROM master_data.operating_companies WHERE is_active = true;
```

Confirm the returned set includes:

- `91e0bf0a-133f-4ce8-a734-2586cfa66d96` (TRANSP — locked, verified)
- TRK row (UUID auto-discovered)
- USMCA row (if exists, inactive)

Use the discovered TRK UUID for all R1/R2/R3 probes.

**If the TRK row is not found or has an unexpected name → HARD STOP + PING JORGE.**

---

## 1. RLS Runtime Matrix (must all PASS)

Each case: open a tx, set the simulated session vars, run the probe query, assert expected row visibility. "Blocked" = **0 rows** returned.

| # | Simulated session | Target rows | Expected | Probe |
|---|-------------------|-------------|----------|-------|
| R1 | `operating_company_id = TRK` | `TRANSP`-owned rows | **BLOCKED (0)** | `SELECT count(*)` per carrier-scoped table WHERE row OCI = TRANSP |
| R2 | `operating_company_id = TRANSP` | `TRK`-owned rows | **BLOCKED (0)** | same, WHERE row OCI = TRK |
| R3 | `operating_company_id = TRK` | `TRK`-owned rows | **VISIBLE (>0 where seeded)** | sanity: policy not over-blocking |
| R4 | `operating_company_id = USMCA` | TRK + TRANSP rows | **BLOCKED (0)** | inactive tenant sees nothing |
| R5 | fake/random UUID | any rows | **BLOCKED (0)** | unknown tenant isolation |
| R6 | unset OCI (no `SET LOCAL`) | any carrier-scoped row | **BLOCKED (0) or ERROR** | `requireOperatingCompanyScope` enforcement |
| R7 | `app.bypass_rls = lucia` | any | VISIBLE (bypass works, **flag this row** — auth bootstrap only) | confirm bypass not leaking into request path |

### 1a. Accounting-table coverage by `operating_company_id`

Run R1–R6 across the full accounting surface, not just dispatch:

- `accounting.*` (journal entries, qbo_accounts, periods, postings)
- `mdata.qbo_accounts`, `mdata.qbo_items`
- `qbo_sync.drift_log`, `qbo_sync.drift_alert_throttle`
- `integrations.qbo_payroll_links`
- AP/AR: bills, bill_payments, invoices, invoice_lines

For **every** carrier-scoped table, assert it has: `ENABLE` + `FORCE ROW LEVEL SECURITY`, a tenant policy referencing `app.operating_company_id`, and the defensive `NULLIF(current_setting('app.operating_company_id', true), '')::uuid` cast. **Report any table missing any of the three.**

---

## 2. Multi-Company Data-Mixing Checks

### 2a. Bank accounts — locked truth table

For each bank account row in `master_data.bank_accounts`, classify and verify ownership against the **locked truth table**:

| Bank / Card | Account label | Expected OCI | Pass condition |
|-------------|---------------|--------------|----------------|
| Wells Fargo ••6103 | TRANSP Operating | `TRANSP` | OCI == TRANSP AND not visible under TRK/USMCA session |
| Wells Fargo ••6129 | TRANSP Payroll | `TRANSP` | OCI == TRANSP AND not visible under TRK/USMCA session |
| Wells Fargo ••6137 | TRANSP DIP Reserve | `TRANSP` | OCI == TRANSP AND not visible under TRK/USMCA session |
| AMEX ••5007 | (corporate card) | `TRANSP` | OCI == TRANSP AND not visible under TRK/USMCA session |
| (any other Wells Fargo / Chase / AMEX row) | — | classify per Jorge or flag | see rules below |

Rules:

- **Unmapped account:** any account NOT in this locked table found in `master_data.bank_accounts` → report as `unmapped — needs Jorge classification` + sample IDs.
- **Wrong OCI:** any account in this table found with a WRONG OCI assignment → report as **CRITICAL truth-table violation**.
- **Shared/ambiguous:** no bank account may be visible to >1 carrier — any account visible under more than its owning OCI = **HARD FAIL** (confirmed cross-tenant leak).

Output: per-account `{bank, label, OCI, visible_under[]}`. Any account visible under more than its owning OCI = confirmed cross-tenant leak.

### 2b. Customers / Vendors cross-OCI leakage

- For `mdata.customers` and `mdata.vendors`: detect duplicate logical entities (same tax_id / name+EIN) assigned to different OCI — flag as **potential mixing** (not auto-fix).
- Assert no customer/vendor row is visible under a non-owning carrier session (reuse R1/R2 probes filtered to these tables).
- Report cross-OCI duplicate clusters with sample IDs.

### 2c. Loads / Invoices / Bills OCI consistency

For each load and its downstream financial docs, assert the OCI chain is consistent:

- `load.operating_company_id` == `invoice.operating_company_id` (for invoices generated from that load)
- `load.operating_company_id` == `bill.operating_company_id` (for carrier/vendor bills tied to that load)
- invoice_lines / bill_lines inherit parent OCI
- settlement / driver-pay rows tied to the load share the same OCI

Any mismatch in the chain = **OCI consistency violation** (count + sample IDs).

---

## 3. Per-Entity Output Schema

Emit one record per audited entity/check:

```json
{
  "entity": "bank_accounts | customers | vendors | loads | invoices | bills | accounting.* | rls_matrix",
  "check_id": "R1 | 2a | 2b | 2c | rls_coverage",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW | INFO",
  "operating_company_id": "TRK | TRANSP | USMCA | <uuid> | mixed",
  "counts": { "scanned": 0, "violations": 0, "blocked_ok": 0 },
  "sample_ids": ["<=10 representative row ids"],
  "confidence": "0.0–1.0",
  "notes": "human-readable finding"
}
```

Severity guide: confirmed cross-tenant row visibility = CRITICAL; missing RLS policy on a carrier-scoped table = HIGH; OCI-chain mismatch = HIGH; duplicate cross-OCI customer/vendor = MEDIUM; bypass-flag observations = INFO.

---

## 4. Aggregate Report

Top-level summary in addition to per-entity records:

- Tables scanned / tables missing RLS triad
- RLS matrix R1–R7 pass/fail grid
- Total confirmed leaks (CRITICAL) and OCI mismatches (HIGH)
- Drift %: `violations / scanned` per entity class

---

## 5. Hard-Stop Criteria (abort audit → escalate)

Stop and escalate to Jorge immediately (do not continue scanning) if ANY:

- **Any confirmed cross-tenant leak** (a row visible under a non-owning carrier session: R1/R2/R4/R5 returns >0, or 2a shared bank account).
- **Drift > 10%** in any entity class (violations/scanned).
- A carrier-scoped accounting table found with **RLS disabled** or **no tenant policy**.
- `app.bypass_rls = lucia` reachable from a normal request path (not just auth bootstrap).

---

## 6. Remediation Gate — PING JORGE

This audit **never** cleans up. On completion (or hard-stop), produce the report and:

> **PING JORGE** with findings summary + proposed remediation options.
> NO cleanup, NO migration, NO data edit, NO PR until Jorge explicitly approves.

---

## 7. GO/NO-GO for downstream PASS-8

- **GO** to PASS-8-RUNTIME only if: RLS matrix all PASS, zero CRITICAL leaks, all carrier-scoped accounting tables have RLS triad, drift ≤ 10% with no HIGH OCI-chain violations.
- **NO-GO** → escalate per §6; PASS-8 stays blocked.

---

## STANDING ORDERS

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact error; live updates every 5min CST/Laredo + real measured data no guesses; confirm worktree pwd git status log rev-parse; show diff --staged --stat before commit; stop on unexpected.

---

## LANE LOCK + ALLOWED FILES

```
CLOSURE-32 EXPANDED (Lane A, SOLO — no parallel work during audit):
FORBIDDEN PATHS: none active (solo wave)
ALLOWED FILES:
- apps/backend/scripts/closure-32-rls-matrix-audit.mjs              (NEW)
- apps/backend/scripts/closure-32-bank-truth-table-audit.mjs        (NEW)
- apps/backend/scripts/closure-32-oci-chain-consistency-audit.mjs   (NEW)
- apps/backend/scripts/closure-32-customer-vendor-dupe-audit.mjs    (NEW)
- apps/backend/scripts/closure-32-rls-coverage-static-audit.mjs     (NEW)
- docs/audits/CLOSURE-32-FINDINGS-2026-06-05.md                     (NEW output)
- .block-ready.json                                          (MANIFEST FIRST)

PASS-8-RUNTIME (Lane A, SOLO):
FORBIDDEN PATHS: none active (solo wave)
ALLOWED FILES:
- apps/backend/scripts/pass-8-runtime-smoke.mjs                     (NEW)
- apps/backend/scripts/pass-8-runtime-healthz-probe.mjs             (NEW)
- apps/backend/test-fixtures/pass-8-runtime-trk-load.json           (NEW)
- apps/backend/test-fixtures/pass-8-runtime-transp-load.json        (NEW)
- docs/audits/PASS-8-RUNTIME-RESULTS-<date>.md                      (NEW output)
- .block-ready.json                                          (MANIFEST FIRST)
```
