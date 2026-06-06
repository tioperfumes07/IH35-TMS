# CLOSURE-32 EXPANDED — Tier-1 Multi-Tenant Isolation Audit — FINDINGS

**Generated (CT):** 2026-06-05 18:31 CDT
**Audit type:** READ-ONLY forensic audit (no writes, no migrations, no auto-fix executed)
**Spec:** `docs/trackers/CLOSURE-32-EXPANDED-TIER1-DISPATCH.md` (amended)
**Target ref:** `origin/main fb7aeae0184aa78ce3ad979e7825d66aec9741fe` **Working tree HEAD at run:** `02f6b2ed6f4845b01c672a353700b70c521186b8` (audit reads live DB + ref-pinned policy/code; no checkout performed)
**Database:** Neon `neondb` (PostgreSQL 16.12), pooled endpoint `ep-broad-block-akykk7bw-pooler`
**Connection role:** `ih35_app` — verified **NOT** superuser, **NOT** `BYPASSRLS` (RLS-subject); all carrier tables `FORCE ROW LEVEL SECURITY`
**Probe method:** explicit `BEGIN … SET LOCAL … COMMIT` read transactions only; `SET LOCAL app.bypass_rls='lucia'` used solely for ground-truth baselines

---

## H1 RESOLUTION UPDATE (2026-06-06)

> **H1 — RESOLVED.** `mdata.drivers` is now OCI-scoped. Migration `db/migrations/0404_drivers_rls_oci_scope.sql` (PR **#599**, merge SHA **`535c02052c482441362c071d05e996254369a288`**) replaced the unscoped `drivers_select` with `is_lucia_bypass() OR operating_company_id IN (SELECT org.user_accessible_company_ids()) OR identity_user_id = identity.current_user_id()` (role `ih35_app`), mirroring `mdata.customers`/`mdata.vendors` and preserving the Driver self-access path. Deployed to prod (preDeploy `db:migrate`; ledger `0404` applied 2026-06-06 05:13:04Z). Permanent regression guard `scripts/verify-drivers-rls-scope.mjs` wired in `.github/workflows/closure-checks.yml`.
>
> **Post-fix RLS re-verification (role `ih35_app`, live prod):** non-owner TRANSP user sees 82 TRANSP / **0 non-TRANSP** (accessible set = `{TRANSP}`); fake-uuid → 0; unset context → 0 (default-deny); `bypass='lucia'` → 82; USMCA (inactive) drivers = 0. Cross-carrier exclusion is enforced by the OCI predicate (a non-owner user only sees drivers in their accessible companies; Owners retain intended multi-company access). **Net: the only HIGH is cleared.** The original audit below is preserved as-of 2026-06-05.

---

## 0. Executive Classification

> ## 🔴 CRITICAL/HIGH PRESENT — HARD STOP / NO-GO for PASS-8-RUNTIME
>
> - **CRITICAL: 0** — zero confirmed cross-tenant row visibility in any runtime probe.
> - **HIGH: 1** — `mdata.drivers` SELECT policy provides **no tenant/OCI scoping** (latent cross-carrier driver visibility; 0 rows leak *today* only because all 82 drivers are TRANSP and no TRK/USMCA drivers exist yet). **→ RESOLVED 2026-06-06 (PR #599, `535c02052`); see "H1 RESOLUTION UPDATE" above.**
> - RLS runtime matrix **R1–R7: 7/7 PASS**. Bank-account isolation: **no account visible to >1 carrier**. OCI chain: **0 mismatches**.
>
> This is **not ALL CLEAN** and **not MEDIUM-ONLY** because of the one HIGH structural isolation defect. **PASS-8-RUNTIME remains blocked.** No cleanup performed — see §7 Recommendation (PING JORGE).

---

## 1. Hard-Stop Criteria Outcomes (§5 of spec)


| #   | Hard-stop criterion                                                                         | Outcome                     | Evidence                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HS1 | Any confirmed cross-tenant leak (R1/R2/R4/R5 > 0, or bank account visible to >1 carrier)    | **NOT TRIGGERED**           | All R1/R2/R4/R5 probes returned **0**; bank accounts isolated per owning OCI                                                                                                                                   |
| HS2 | Drift > 10% in any entity class (isolation violations / scanned)                            | **NOT TRIGGERED**           | Isolation-violation drift = **0%** across all classes. (A separate *data-hygiene* metric for bank duplicate masks = 44% is **not** an isolation violation — see M1)                                            |
| HS3 | Carrier-scoped **accounting** table with RLS disabled or no tenant policy                   | **NOT TRIGGERED**           | 0 carrier-scoped tables missing ENABLE/FORCE; 0 with zero policies; every `accounting.*` table carries a tenant policy referencing `app.operating_company_id`                                                  |
| HS4 | `app.bypass_rls='lucia'` reachable from a **normal request path** (not just auth bootstrap) | **FLAGGED (not confirmed)** | `withLuciaBypass` is invoked inside authenticated route handlers (post-auth, purpose-scoped). No unauthenticated/user-facing leak proven by DB audit. Rated **MEDIUM (M2)** — code-owner confirmation required |


**TRK UUID discovery / hard-stop gate (amended spec):** PASS — TRK present, active, exactly one. See §2.

> **Net:** No §5 criterion is *definitively* triggered, but **one HIGH finding (H1)** exists, which forces the overall classification to **CRITICAL/HIGH present (hard stop)** and **NO-GO** per the dispatch classification rules.

---

## 2. TRK UUID Discovery (mandatory first step)

**Spec deviation (documented):** the dispatch spec's literal discovery query targets `master_data.operating_companies (uuid, name, is_active)`. **That table does not exist** in this database. The authoritative operating-company table is `**org.companies`** (per `docs/specs/MULTI-CARRIER-ISOLATION.md`), with columns `id`, `code`, `legal_name` (no `name`/`uuid` columns). The query was adapted to the real schema; this is a spec/schema naming drift, not a data defect.

Adapted discovery query:

```sql
SELECT id, code, legal_name, company_type, is_active FROM org.companies ORDER BY code;
```


| code       | UUID                                   | legal_name                  | company_type      | is_active            |
| ---------- | -------------------------------------- | --------------------------- | ----------------- | -------------------- |
| **TRANSP** | `91e0bf0a-133f-4ce8-a734-2586cfa66d96` | IH 35 Transportation LLC    | operating_carrier | `true`               |
| **TRK**    | `b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e` | IH 35 Trucking LLC          | asset_holder      | `true`               |
| **USMCA**  | `5c854333-6ea5-4faa-af31-67cb272fef80` | USMCA Freight Solutions Inc | operating_carrier | `false` (pre-launch) |


**Hard-stop check:** TRK present ✔, active ✔, single row ✔; TRANSP active ✔; USMCA inactive as expected ✔. **No hard-stop.**

---

## 3. RLS Runtime Matrix R1–R7 (§1)

Two isolation patterns exist in this DB and were each probed with the appropriate session variable:

- **Pattern A — session-var scope:** `is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id',true),'')::uuid` (and a `::text`-compare variant). Probed via `app.operating_company_id`. Representative table: `banking.bank_accounts` (ground truth TRK=4, TRANSP=5).
- **Pattern B — user-access scope:** `operating_company_id IN (SELECT org.user_accessible_company_ids())` / `org.user_company_access`, keyed on `app.current_user_id`. Probed via `app.current_user_id`. Representative table: `mdata.vendors` (ground truth TRK=1, TRANSP=877). *(Note: at runtime the request wrapper `withOperatingCompanyScope` sets BOTH session vars, so both patterns are enforced together.)*


| #   | Simulated session          | Probe table             | Expected                | Observed                             | Result                             |
| --- | -------------------------- | ----------------------- | ----------------------- | ------------------------------------ | ---------------------------------- |
| R1  | OCI = TRK                  | `banking.bank_accounts` | TRANSP rows BLOCKED (0) | total 4, **TRANSP visible 0**, TRK 4 | ✅ PASS                             |
| R2  | OCI = TRANSP               | `banking.bank_accounts` | TRK rows BLOCKED (0)    | total 5, **TRK visible 0**, TRANSP 5 | ✅ PASS                             |
| R3  | OCI = TRK                  | `banking.bank_accounts` | TRK rows VISIBLE (>0)   | TRK visible 4                        | ✅ PASS (not over-blocking)         |
| R4  | OCI = USMCA (inactive)     | `banking.bank_accounts` | BLOCKED (0)             | 0                                    | ✅ PASS                             |
| R5  | fake UUID `0000…0000`      | `banking.bank_accounts` | BLOCKED (0)             | 0                                    | ✅ PASS                             |
| R6  | unset OCI (no `SET LOCAL`) | `banking.bank_accounts` | BLOCKED (0) or ERROR    | 0 (default-deny)                     | ✅ PASS                             |
| R7  | `app.bypass_rls='lucia'`   | `banking.bank_accounts` | VISIBLE (flag)          | 9 (all)                              | ✅ as designed — **INFO flag (I1)** |


**Pattern B cross-check (user-context):**


| #    | Simulated session              | Probe table     | Expected               | Observed                                        | Result                          |
| ---- | ------------------------------ | --------------- | ---------------------- | ----------------------------------------------- | ------------------------------- |
| B-R1 | TRANSP Driver user `2fb04892…` | `mdata.vendors` | TRK vendor BLOCKED (0) | total 490 active, **TRK visible 0**, TRANSP 490 | ✅ PASS (lone TRK vendor hidden) |
| B-R5 | fake user UUID                 | `mdata.vendors` | BLOCKED (0)            | 0                                               | ✅ PASS                          |
| B-R6 | no user context                | `mdata.vendors` | BLOCKED (0)            | 0 (default-deny)                                | ✅ PASS                          |


> *(B-R1 returns 490, not 877, because the SELECT policy also requires `deactivated_at IS NULL`; the 387 deactivated TRANSP vendors are filtered. The decisive result is `trk_visible = 0`.)*

**RLS Matrix verdict: R1–R7 = 7/7 PASS.** Bypass (R7) confirmed working as the auth-bootstrap escape hatch only at the DB layer.

### 3a. Accounting-surface RLS triad coverage (§1a)

294 carrier-scoped base tables (tables carrying `operating_company_id`) were enumerated and classified:


| Metric                                                                                     | Count                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Total carrier-scoped base tables                                                           | **294**                                                       |
| Missing `ENABLE`/`FORCE` RLS                                                               | **0**                                                         |
| Tables with **zero** RLS policies                                                          | **0**                                                         |
| Policies reference `app.operating_company_id` (Pattern A)                                  | 273                                                           |
| • with canonical defensive `NULLIF(...)::uuid` cast (full triad)                           | **145**                                                       |
| • with functional `(operating_company_id)::text = current_setting(...)` (no NULLIF)        | **128** → see **L1**                                          |
| Do **not** reference `app.operating_company_id` (alternative isolation)                    | 21                                                            |
| • isolated via `user_company_access` / `user_accessible_company_ids()` / `current_user_id` | 19                                                            |
| • using **neither** mechanism                                                              | **2** → `admin.launch_toggles` (L2), `mdata.drivers` (**H1**) |


All §1a-enumerated surfaces verified to carry a tenant policy referencing `app.operating_company_id` with the defensive NULLIF cast: `accounting.journal_entries`, `accounting.qbo_accounts`*, `accounting.periods`*, `accounting.invoices`, `accounting.bills`, `accounting.invoice_lines`, `mdata.qbo_accounts`*, `mdata.qbo_items`*, `qbo_sync.drift_log`, `qbo_sync.drift_alert_throttle`, `integrations.qbo_payroll_links`, AP/AR (`bills`, `bill_payments`, `invoices`, `invoice_lines`). *(`*` = uses functional `::text`-compare variant rather than canonical NULLIF cast — see L1; isolation is still enforced.)*

---

## 4. Multi-Company Data-Mixing Checks (§2)

### 4a. Bank-account truth table (Wells 6103/6129/6137 + AMEX 5007 ⇒ TRANSP)

Ground truth (9 rows; balances in cents):


| OCI    | Bank             | Mask     | Active       | balance_cents | Plaid item | txn_count |
| ------ | ---------------- | -------- | ------------ | ------------- | ---------- | --------- |
| TRANSP | Wells Fargo      | 3500     | ✔            | -7,399        | `3ebg…`    | 13        |
| TRANSP | American Express | **5007** | ✔            | 3,551,852     | `Exze…`    | 635       |
| TRANSP | Wells Fargo      | **6103** | ✔            | 383,749       | `3ebg…`    | 740       |
| TRANSP | Wells Fargo      | **6129** | ✔            | 34,411        | `3ebg…`    | 547       |
| TRANSP | Wells Fargo      | **6137** | ✔            | 53,678        | `3ebg…`    | 714       |
| TRK    | Wells Fargo      | 3500     | ✔            | -7,399        | `jmze…`    | **0**     |
| TRK    | Wells Fargo      | 6103     | ✖ (inactive) | 383,749       | `jmze…`    | **0**     |
| TRK    | Wells Fargo      | 6129     | ✖ (inactive) | 34,411        | `jmze…`    | **0**     |
| TRK    | Wells Fargo      | 6137     | ✖ (inactive) | 53,678        | `jmze…`    | **0**     |


**Truth-table mapping (explicit accounts):** Wells **6103/6129/6137** + AMEX **5007** ⇒ owned by **TRANSP**, **active**, transaction-bearing. ✅ **100% correct** for the authoritative/active accounts.

**Cross-tenant visibility (the §2a / §5 hard-stop test):** Per R1/R2, under a TRK session only the 4 TRK rows are visible and under a TRANSP session only the 5 TRANSP rows are visible. **No bank account is visible to more than its owning OCI → no confirmed leak → no CRITICAL.**

**Wrong-OCI determination:** No account that the truth table maps to TRANSP is *actively* owned by another carrier — the TRANSP rows for 6103/6129/6137/5007 are correctly TRANSP. **Therefore not CRITICAL "wrong OCI".** However, TRK carries **duplicate-mask shadow rows** (separate Plaid item `jmze…`, identical masks and balances to the TRANSP live accounts, **0 transactions**): 6103/6129/6137 are deactivated; `**...3500` remains ACTIVE** and unmapped. Classified **MEDIUM (M1)** — historical mis-seed / duplicate carrier setup; reconcile before go-live.

### 4b. Customers / Vendors cross-OCI leakage (§2b)

- `mdata.customers`: **1,213 rows, all TRANSP** (single OCI) → no cross-OCI customer clusters possible. **0 mixing.**
- `mdata.vendors`: 877 TRANSP + 1 TRK. Cross-OCI duplicate-entity scan by `tax_id` and by `email`: **0 clusters**. The single TRK vendor has empty `tax_id`/`email` (placeholder). **0 mixing.**
- Cross-tenant visibility: the lone TRK vendor is **hidden** from a TRANSP user session (B-R1). ✅

### 4c. Loads / Invoices / Bills OCI consistency (§2c)


| Entity                                                             | Rows (by OCI) | Chain check                                         | Result                |
| ------------------------------------------------------------------ | ------------- | --------------------------------------------------- | --------------------- |
| `mdata.loads`                                                      | 0             | n/a                                                 | no chains to validate |
| `accounting.invoices`                                              | 1 (TRANSP)    | invoice OCI == customer OCI (`source_load_id` null) | ✅ match (0 mismatch)  |
| `accounting.invoice_lines`                                         | 1 (TRANSP)    | line OCI == parent invoice OCI                      | ✅ **0 mismatch**      |
| `accounting.bills`                                                 | 0             | n/a                                                 | none                  |
| `driver_finance.driver_settlements` / `payroll.driver_settlements` | 0 / 0         | n/a                                                 | none                  |


**OCI-chain violations: 0.** (Coverage is thin because only 1 invoice + 1 line are seeded; loads/bills/settlements are empty.)

---

## 5. Per-Entity Records (§3 schema)

```json
[
  {"entity":"rls_matrix","check_id":"R1","severity":"INFO","operating_company_id":"TRK","counts":{"scanned":9,"violations":0,"blocked_ok":1},"sample_ids":["banking.bank_accounts"],"confidence":1.0,"notes":"TRK session: TRANSP bank rows blocked (0). PASS."},
  {"entity":"rls_matrix","check_id":"R2","severity":"INFO","operating_company_id":"TRANSP","counts":{"scanned":9,"violations":0,"blocked_ok":1},"sample_ids":["banking.bank_accounts"],"confidence":1.0,"notes":"TRANSP session: TRK bank rows blocked (0). PASS."},
  {"entity":"rls_matrix","check_id":"R3","severity":"INFO","operating_company_id":"TRK","counts":{"scanned":4,"violations":0,"blocked_ok":0},"sample_ids":["banking.bank_accounts"],"confidence":1.0,"notes":"TRK session sees own 4 rows; policy not over-blocking. PASS."},
  {"entity":"rls_matrix","check_id":"R4","severity":"INFO","operating_company_id":"USMCA","counts":{"scanned":9,"violations":0,"blocked_ok":1},"sample_ids":[],"confidence":1.0,"notes":"Inactive USMCA session sees 0. PASS."},
  {"entity":"rls_matrix","check_id":"R5","severity":"INFO","operating_company_id":"00000000-0000-0000-0000-000000000000","counts":{"scanned":9,"violations":0,"blocked_ok":1},"sample_ids":[],"confidence":1.0,"notes":"Fake UUID session sees 0. PASS."},
  {"entity":"rls_matrix","check_id":"R6","severity":"INFO","operating_company_id":"unset","counts":{"scanned":9,"violations":0,"blocked_ok":1},"sample_ids":[],"confidence":1.0,"notes":"Unset OCI default-deny -> 0. PASS."},
  {"entity":"rls_matrix","check_id":"R7","severity":"INFO","operating_company_id":"mixed","counts":{"scanned":9,"violations":0,"blocked_ok":0},"sample_ids":[],"confidence":1.0,"notes":"bypass=lucia returns all 9 rows as designed (auth bootstrap escape hatch). FLAG."},
  {"entity":"mdata.vendors","check_id":"R1","severity":"INFO","operating_company_id":"TRANSP","counts":{"scanned":878,"violations":0,"blocked_ok":1},"sample_ids":["2daaa22f-4cfa-4dc5-af1e-b0f1157e1fa0"],"confidence":1.0,"notes":"Pattern-B: TRANSP user cannot see the 1 TRK vendor. PASS."},
  {"entity":"mdata.drivers","check_id":"rls_coverage","severity":"HIGH","operating_company_id":"mixed","counts":{"scanned":82,"violations":0,"blocked_ok":0},"sample_ids":["drivers_select policy"],"confidence":0.9,"notes":"SELECT policy = is_lucia_bypass() OR current_user_role() IS NOT NULL — NO operating_company_id scoping. Any role-bearing user sees ALL drivers cross-carrier. 0 rows leak today only because all 82 drivers are TRANSP. Latent cross-tenant gap; activates when TRK/USMCA onboard drivers."},
  {"entity":"bank_accounts","check_id":"2a","severity":"MEDIUM","operating_company_id":"mixed","counts":{"scanned":9,"violations":4,"blocked_ok":9},"sample_ids":["79a07d34-3ee1-491a-9ea4-c1b9a684026b","d8d940ec-0645-48f0-822c-001a05b701ee","e0883de2-3327-4809-8385-84af3ee63275","b2e28d77-6ab6-48c4-ad0a-0f894dabea5b"],"confidence":0.8,"notes":"TRK holds duplicate-mask shadow rows (3500 active; 6103/6129/6137 inactive) mirroring TRANSP live accounts: identical masks+balances, separate Plaid item jmze..., 0 transactions. RLS-isolated (not a leak). Reconcile/dedupe; confirm TRK ...3500 active duplicate."},
  {"entity":"bank_accounts","check_id":"2a","severity":"INFO","operating_company_id":"TRANSP","counts":{"scanned":5,"violations":0,"blocked_ok":5},"sample_ids":["1ecfa9df-d1e1-423a-88f5-f883e081b9c8","7fa68666-a2bb-4709-9154-61dcec993757","5b85c994-927a-43b6-a63a-76efea2da7e6","3de13452-9e73-4edb-bb9c-b4e11204b1c4"],"confidence":1.0,"notes":"Truth-table accounts 6103/6129/6137 + AMEX 5007 correctly active under TRANSP. 100%."},
  {"entity":"customers","check_id":"2b","severity":"INFO","operating_company_id":"TRANSP","counts":{"scanned":1213,"violations":0,"blocked_ok":0},"sample_ids":[],"confidence":1.0,"notes":"Single OCI (TRANSP); no cross-OCI duplicate clusters possible."},
  {"entity":"vendors","check_id":"2b","severity":"INFO","operating_company_id":"mixed","counts":{"scanned":878,"violations":0,"blocked_ok":0},"sample_ids":[],"confidence":1.0,"notes":"0 cross-OCI tax_id/email duplicate clusters. Lone TRK vendor is placeholder (empty tax_id/email)."},
  {"entity":"invoices","check_id":"2c","severity":"INFO","operating_company_id":"TRANSP","counts":{"scanned":1,"violations":0,"blocked_ok":0},"sample_ids":["06c7af5d-3f50-4d56-bf89-2f79124913b9"],"confidence":1.0,"notes":"invoice OCI == customer OCI; invoice_lines inherit parent OCI (0 mismatch); source_load_id null."},
  {"entity":"accounting.*","check_id":"rls_coverage","severity":"LOW","operating_company_id":"mixed","counts":{"scanned":294,"violations":128,"blocked_ok":273},"sample_ids":["accounting.periods","safety.incidents","accounting.qbo_customers","catalogs.tax_codes","payroll.driver_settlements"],"confidence":1.0,"notes":"128 carrier-scoped tables use (operating_company_id)::text = current_setting(...) instead of canonical NULLIF(...)::uuid cast (migration 0359). Isolation functionally holds; standardization drift only."},
  {"entity":"admin.launch_toggles","check_id":"rls_coverage","severity":"LOW","operating_company_id":"n/a","counts":{"scanned":1,"violations":0,"blocked_ok":1},"sample_ids":["launch_toggles_owner_scope"],"confidence":0.9,"notes":"Carrier-scoped column present but policy is bypass-only (app.bypass_rls='lucia'); invisible to normal sessions (over-restrictive, not a leak). Global config table."},
  {"entity":"rls_matrix","check_id":"R7","severity":"MEDIUM","operating_company_id":"n/a","counts":{"scanned":3,"violations":0,"blocked_ok":0},"sample_ids":["settlements.routes.ts:389","plaid/link.routes.ts:91","auth/routes.ts:173"],"confidence":0.6,"notes":"withLuciaBypass invoked inside authenticated route handlers (post-auth, purpose-scoped: login bootstrap, settlement notification email, Plaid account load-by-id). Touches §5 HS4. Not a confirmed user-facing leak; needs code-owner confirmation that handlers cannot return cross-tenant rows (esp. plaid loadBankAccountsByIds)."}
]
```

---

## 6. Aggregate Report (§4) & Severity Counts


| Severity     | Count | Findings                                                                                                                 |
| ------------ | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| **CRITICAL** | **0** | —                                                                                                                        |
| **HIGH**     | **1** | H1 `mdata.drivers` non-isolating SELECT policy                                                                           |
| **MEDIUM**   | **2** | M1 bank duplicate-mask cross-OCI rows; M2 bypass reachable from authenticated request handlers (HS4 flag)                |
| **LOW**      | **2** | L1 128 tables non-canonical `::text` cast; L2 `admin.launch_toggles` bypass-only                                         |
| **INFO**     | **2** | I1 R7 bypass works as designed; I2 discovery table-name spec drift (`master_data.operating_companies` → `org.companies`) |


**Tables scanned / missing RLS triad:** 294 scanned; 0 RLS-disabled; 0 policy-less; 145 full canonical triad; 128 functional-but-non-canonical cast; 19 alternative user-scope isolation; **2** using neither (1 intentional global config, 1 = H1).

**RLS matrix:** R1–R7 = **7/7 PASS** (+ Pattern-B B-R1/B-R5/B-R6 PASS).

**Confirmed leaks (CRITICAL):** 0. **OCI-chain mismatches (HIGH):** 0.

**Drift % (isolation violations / scanned):**


| Entity class                            | Scanned | Isolation violations | Drift          |
| --------------------------------------- | ------- | -------------------- | -------------- |
| RLS matrix probes                       | 10      | 0                    | 0%             |
| bank_accounts (cross-tenant visibility) | 9       | 0                    | 0%             |
| customers                               | 1,213   | 0                    | 0%             |
| vendors                                 | 878     | 0                    | 0%             |
| invoices / invoice_lines (OCI chain)    | 2       | 0                    | 0%             |
| **All isolation classes**               | —       | **0**                | **0% (≤10 ✔)** |


> Separate **data-hygiene** metric (not an isolation violation, not counted toward HS2): bank duplicate-mask rows = 4/9 (44%). Reported under M1 for visibility only.

### GO / NO-GO (§7)


| GO requirement                                          | Status                                          |
| ------------------------------------------------------- | ----------------------------------------------- |
| RLS matrix all PASS                                     | ✅ 7/7                                           |
| Zero CRITICAL leaks                                     | ✅ 0                                             |
| All carrier-scoped **accounting** tables have RLS triad | ✅ (functional; 128 use non-canonical cast — L1) |
| Drift ≤ 10%, no HIGH **OCI-chain** violations           | ✅ 0% / 0                                        |
| **Zero HIGH findings overall**                          | ❌ **1 HIGH (H1 `mdata.drivers`)**               |


**VERDICT: 🔴 NO-GO.** PASS-8-RUNTIME stays blocked. Escalate to Jorge (§6 of spec). PASS-8-RUNTIME **was NOT dispatched**; no production code or data modified.

---

## 7. Remediation Gate — PING JORGE (proposal only, NO cleanup performed)

> **@Jorge — CLOSURE-32 EXPANDED returned NO-GO. One HIGH structural isolation defect blocks PASS-8. No cleanup, migration, data edit, or PR has been performed. The following are options only — awaiting your explicit approval before any action.**

**H1 — `mdata.drivers` lacks tenant scoping (HIGH, must-fix before TRK/USMCA driver onboarding):**

- Current `drivers_select` = `is_lucia_bypass() OR current_user_role() IS NOT NULL` → every authenticated office/driver role sees **all** drivers regardless of carrier. Today no data leaks (all 82 drivers are TRANSP), but it **will** leak the moment TRK or USMCA (July 2026 launch) onboards drivers.
- *Proposed (for approval):* add an `operating_company_id IN (SELECT org.user_accessible_company_ids())` predicate to `drivers_select` (mirroring `mdata.customers`/`mdata.vendors`), preserving the Driver self-access path. **Migration only — do not apply until approved.**

**M1 — Bank duplicate-mask cross-OCI accounts (MEDIUM, reconcile before go-live):**

- TRK holds shadow rows (Plaid item `jmze…`) mirroring TRANSP's live accounts: `...3500` **active** + `...6103/6129/6137` inactive, all with **0 transactions** and balances identical to the TRANSP originals. RLS isolates them (no leak), but the **active** TRK `...3500` duplicate is the item to confirm.
- *Proposed (for approval):* confirm whether the TRK shadow rows are legacy/migration artifacts; if so, deactivate/remove the TRK duplicates (esp. active `...3500`). **No edit performed.**

**M2 — `app.bypass_rls='lucia'` in authenticated request handlers (MEDIUM, code review):**

- `withLuciaBypass` is invoked at `auth/routes.ts:173` (login bootstrap — expected), `integrations/plaid/link.routes.ts:91` (`loadBankAccountsByIds` — loads bank rows by id under bypass), and `driver-finance/settlements.routes.ts:389` (post-finalize notification email). All are post-auth and purpose-scoped, but touch §5 HS4.
- *Proposed (for approval):* code-owner to confirm each call site cannot return cross-tenant rows to the wrong user (priority: Plaid `loadBankAccountsByIds` id-filtering). No exploit confirmed by this DB audit.

**L1 (optional, standardization):** migrate the 128 `(operating_company_id)::text = current_setting(...)` policies to the canonical defensive `NULLIF(current_setting('app.operating_company_id',true),'')::uuid` cast (migration 0359 pattern). Isolation already functionally holds.

**L2/I2 (housekeeping):** `admin.launch_toggles` is bypass-only (intentional global config); and update the CLOSURE-32 dispatch spec discovery query to reference `org.companies` (not `master_data.operating_companies`).

---

## 8. Reproducibility

- All probes run as RLS-subject role `ih35_app` in explicit read transactions; identical output expected on a static DB.
- Discovery: `SELECT id, code, legal_name, company_type, is_active FROM org.companies ORDER BY code;`
- Matrix & summary SQL preserved at `/tmp/cls32_matrix.sql`, `/tmp/cls32_cast.sql`, `/tmp/cls32_summary.sql` (session-local; not committed).
- No `INSERT/UPDATE/DELETE/DDL` issued. No migration run. No tracker pass-count modified. PASS-8-RUNTIME not dispatched.

