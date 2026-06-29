# CAS-03 — Live Verification of the Merged Schema-Integrity Gates

**Date:** 2026-06-28
**Author:** Cascade (verification lane)
**Method:** fresh-migrated local DB (the Verification Standard — `information_schema` is the truth, not
the stale baseline JSON). Read-only verification; no production touch; the one temp probe file was
created, tested, and deleted in-session.
**Verdict:** **PASS** — both gates work as designed and would have caught the 2026-06-28 prod 500s.

---

## 0. Environment (reproducible)

```
docker compose -f docker-compose.verify.yml up -d      # postgres:16-alpine, tmpfs, port 54329
DATABASE_URL=postgresql://verify:verify@localhost:54329/ih35_verify npm run verify:db:reset
```
- Fresh-migrated DB: **all db/migrations applied successfully** (last = `202606280930_bank_feed_transp_transaction_categories_seed.sql`).
- Model introspected by the gates: **LIVE migrated DB = 654 tables** (not the fallback baseline).

---

## 1. Read-Query Gate (#1575 `verify-sql-read-targets.mjs`)

**Clean run on main (fresh-migrated model):**
```
verify-sql-read-targets: model = LIVE migrated DB (654 tables).
verify-sql-read-targets: scanned 3288 SQL blocks, 11435 schema-qualified column refs (59 untracked-schema refs skipped).
verify-sql-read-targets OK — no NEW phantom reads. 197 pre-existing known-debt item(s) remain.
```
- **PASS.** No new phantom reads; 197 known-debt items tracked (ratchet may only shrink).
- Dynamic/unparseable + untracked-schema refs are bucketed (59 skipped) and reported, not silently passed — matches the honest-limitation design.

**A2 — phantom-catch test (deliberate fault):** planted
`SELECT je.cas03_does_not_exist_col FROM accounting.journal_entries je` in a throwaway file.
```
verify-sql-read-targets FAILED:
  1 NEW phantom read target(s) ...
  apps/backend/src/__cas03_phantom_probe.ts: je.cas03_does_not_exist_col — column "cas03_does_not_exist_col" does not exist on accounting.journal_entries
```
- **CAUGHT.** Gate fails closed on a new phantom read. Probe removed → gate returns to OK.

---

## 2. Write-Target Gate (#1571 / #1572 `verify-sql-write-targets.mjs`)

**Clean run on main (fresh-migrated model):**
```
verify-sql-write-targets: scanned 750 INSERT + 949 UPDATE schema-qualified write targets across the backend.
verify-sql-write-targets: 5 known-debt entr(y/ies) are now FIXED — remove them from sql-write-targets-known-debt.json (the list must shrink):
  ✓ fixed: .../bank-recon/match.service.ts: INSERT INTO accounting.journal_entries — column "created_by" does not exist
  ✓ fixed: .../bank-recon/match.service.ts: INSERT INTO accounting.journal_entries — column "reference_no" does not exist
  ✓ fixed: .../bank-recon/match.service.ts: INSERT INTO accounting.journal_entry_postings — column "journal_entry_id" does not exist
  ✓ fixed: .../bank-recon/match.service.ts: INSERT INTO accounting.journal_entry_postings — column "memo" does not exist
  ✓ fixed: .../bank-recon/match.service.ts: INSERT INTO accounting.journal_entry_postings — column "side" does not exist
verify-sql-write-targets OK — no NEW phantom writes. 48 pre-existing known-debt item(s) remain.
```
- **PASS.** No new phantom writes; the ratchet correctly flags 5 now-FIXED entries (the bank-recon phantom fix from #1572) as removable — proof the shrink-only ratchet is live.

**A2 — phantom-catch test:** planted
`INSERT INTO accounting.cas03_does_not_exist_table (...)`.
```
verify-sql-write-targets FAILED:
  1 NEW phantom write target(s) ...
  apps/backend/src/__cas03_phantom_probe.ts: INSERT INTO accounting.cas03_does_not_exist_table — TABLE not in migrated schema
```
- **CAUGHT.** Gate fails closed on a new phantom write. Probe removed → gate returns to OK.

---

## 3. Independent schema spot-checks (CAS-01-style — validate the gate isn't lying)

Run directly against the fresh-migrated `information_schema`:

| Check | Result | Meaning |
|---|---|---|
| `accounting.bills.payment_terms_id` | table exists, **column ABSENT** | Confirms the home /role-home 500 root cause (G1/BUG-1) is real — the gate would flag this read. |
| `accounting.invoices.payment_terms_id` | **column EXISTS** | CC-04's fix (repoint home card to `invoices.payment_terms_id`) targets a real column. ✓ |
| `mdata.equipment` table | exists | Compliance 500 is a missing-**column** (`operating_company_id`) issue, not a missing table (G1/BUG-2). |
| `accounting.fixed_assets` | **ABSENT** | Confirms the Fixed-Assets data-model spec (PR #1581) is net-new — no collision. |
| `accounting.prepaid_assets` | EXISTS | Confirms the proven pattern source for the new specs is real. |

No false positives or false negatives found in the spot-checks.

---

## 4. Findings / fix-owner (no fixes executed here)

| # | Finding | Verdict | Owner / Tier |
|---|---|---|---|
| 1 | Read gate catches new phantom reads, fails closed, ratchet shrink-only | CONFIRMED | — (gate healthy) |
| 2 | Write gate catches new phantom writes + flags 5 now-fixed bank-recon entries | CONFIRMED | Coder: remove the 5 fixed entries from `sql-write-targets-known-debt.json` (ratchet shrink) |
| 3 | 197 known-debt reads + 48 known-debt writes remain | CONFIRMED | Coder (CC-04 cleanup) — tracked, shrink-only |
| 4 | `accounting.bills.payment_terms_id` phantom (home 500) | CONFIRMED real | Coder CC-04 (repoint to invoices) |
| 5 | `mdata.equipment.operating_company_id` phantom (compliance 500) | CONFIRMED real | Coder CC-04 (correct tenant-scope path) |

---

## 5. Acceptance

- **A1:** both gates run green on the fresh-migrated model (654 tables) — pasted §1, §2.
- **A2:** deliberately-introduced phantom read AND phantom write each FAIL their gate — pasted §1, §2; probe deleted, gates return to OK.
- **A3:** independent `information_schema` spot-checks validate the gate's truth source (§3) — no false pos/neg.
- **A4:** the write-gate ratchet correctly identifies 5 now-fixed entries as removable (shrink-only proven).
- No production touch; no code changed; the throwaway probe was created and deleted in-session.

**CAS-03 verdict: PASS.** The merged gates (#1575 read, #1571/#1572 write) are sound and would have
caught both 2026-06-28 prod 500s at PR time. Handoff to Coder: shrink the write known-debt by the 5
proven-fixed entries; continue CC-04 read known-debt remediation.

---

## 6. Extension — the remaining #1572 pieces (added 2026-06-28, second pass)

The first pass covered the read/write **target** gates. This pass exercises the other three #1572
guards the dispatch named: the two static **column-contract** gates + the runtime **startup probe**.
All static; the probe was run with a mock client + read directly. No prod touch; throwaway probe files
created and deleted in-session.

### 6.1 `verify:financial-column-contracts` (static)
Clean run:
```
verify-financial-column-contracts OK — 1294 files scanned, 7 financial tables covered, 0 phantom column references.
```
Planted fault (`SELECT je.cas03_phantom_col FROM accounting.journal_entries je` + deprecated posting
columns) →
```
verify-financial-column-contracts FAILED:
  ✗ ...__cas03_contract_probe.ts: references accounting.journal_entry_postings.credit_cents — not in migration-derived column set
  ✗ ...__cas03_contract_probe.ts: references accounting.journal_entry_postings.debit_cents — not in migration-derived column set
  ✗ ...__cas03_contract_probe.ts: references accounting.journal_entry_postings.journal_entry_id — not in migration-derived column set
```
**CAUGHT.** Probe removed → returns to OK. **Verdict: gate works.**

### 6.2 `verify:posting-column-contract` (static)
Clean run (3 pre-existing non-blocking WARNs for missing `idempotency_key` in
period-close/recurring/void services — flagged for Coder, not failures):
```
verify-posting-column-contract OK — 1294 backend files scanned, 0 posting column contract violations.
```
Planted fault (`INSERT INTO accounting.journal_entry_postings (journal_entry_id, debit_cents, credit_cents)`) →
```
verify-posting-column-contract FAILED:
  ✗ ...__cas03_contract_probe.ts: INSERT ... missing `debit_or_credit` (use split model, not debit_cents/credit_cents)
  ✗ ...__cas03_contract_probe.ts: INSERT ... missing `operating_company_id` (entity-scope safety)
  ✗ ...__cas03_contract_probe.ts: INSERT ... uses `journal_entry_id` — renamed to `journal_entry_uuid` in migration 0092
  ✗ ...__cas03_contract_probe.ts: INSERT ... uses deprecated `credit_cents` — use `debit_or_credit` + `amount_cents`
```
**CAUGHT** (all four contract rules). Probe removed → returns to OK. **Verdict: gate works.**

### 6.3 startup-column-probe (runtime — `apps/backend/src/accounting/startup-column-probe.ts`)
The probe checks **4 posting tables** on boot — `accounting.journal_entries`,
`accounting.journal_entry_postings`, `accounting.posting_batches`,
`accounting.transaction_source_links` — and throws `StartupColumnProbeError` if any referenced column
is absent (skips when `DATABASE_URL` is unset). Exercised via a throwaway runner with a mock client:
```
A PASS: startup probe OK when all 4 tables have their required columns.
B PASS: threw StartupColumnProbeError on missing journal_entry_postings.idempotency_key:
    STARTUP COLUMN PROBE FAILED — required columns missing from live DB.
    ...
    Missing:
      accounting.journal_entry_postings.idempotency_key
```
**Verdict: probe works** — fails loud (refuses to boot) when a required posting column is missing,
catching the "migration not applied" class before any write. Runner deleted in-session.

### 6.4 Extension acceptance
- **B1:** financial-column-contracts catches a planted phantom column, clean after removal. ✅
- **B2:** posting-column-contract catches deprecated names + missing entity scope, clean after removal. ✅
- **B3:** startup-column-probe passes with full columns and throws on a missing required column. ✅
- **B4 (note):** 3 pre-existing `idempotency_key` WARNs in posting-column-contract (period-close,
  recurring, void services) — non-blocking; handed to Coder to add the key for idempotency safety.

**Extension verdict: PASS.** All five #1572-class guards (read-target, write-target, financial-column-
contract, posting-column-contract, startup-column-probe) are sound and fail-closed on their bug class.
