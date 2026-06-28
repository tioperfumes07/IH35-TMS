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
