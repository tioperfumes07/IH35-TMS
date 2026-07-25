# Lane assignment — 2026-07-23 (Cursor ↔ Claude, no-collision protocol)

**Owner-directed split.** Cursor finishes **accounting + banking**. Claude continues the owner-locked
module sequence from **safety** onward. Both work to `docs/specs/DEFINITION-OF-DONE.md`.

---

## 1. Lane ownership (hard boundary)

| | **CURSOR** | **CLAUDE (GUARD)** |
|---|---|---|
| Modules | accounting, banking | safety, lists, maintenance, insurance, legal, dispatch, settlements, factoring, vendors, customers, drivers, driver-hub, fleet, cash-flow, finance |
| Backend dirs | `apps/backend/src/accounting/**`, `apps/backend/src/banking/**` | everything else under `apps/backend/src/**` |
| Frontend dirs | `apps/frontend/src/pages/accounting/**`, `apps/frontend/src/pages/banking/**` | everything else under `apps/frontend/src/**` |
| API clients | `apps/frontend/src/api/accounting*.ts`, `banking*.ts` | other `apps/frontend/src/api/*.ts` |

**Rule:** if a change requires editing a file in the other lane, **do not edit it.** Post the exact
file + line + required change in the PR body and let the other lane make it. A cross-lane edit is the
single most likely way to lose work.

---

## 2. Reserved verify-step number ranges (collision = lost guard)

`scripts/verify-steps/NNNN-*.mjs` numbers must never collide — a duplicate has already had to be
reverted once in this repo.

| Lane | Reserved range |
|---|---|
| **CLAUDE** | **1325 – 1399** |
| **CURSOR** | **1400 – 1499** |

Currently taken: `…1312, 1320, 1321, 1322, 1323, 1324` (Claude), `1400, 1402, 1403, 1404, 1406` (Cursor).
Claim the next free number **in your own range only**, and re-check at push time.

## 2a. Reserved MIGRATION-number ranges (collision = broken merge)

`db/migrations/NNNNNNNNNNNN_*.sql` numbers are a SINGLE shared sequence and MUST be strictly above
main's max — but with both lanes building held migrations in parallel, "strictly above max at author
time" is not enough: two open branches pick the same next number and collide when the second merges.
This already happened — #3348 (escrow-forfeit) and the accounting lane both authored `202607760000`;
#3348 had to renumber to `202607800000`.

To make collisions structurally impossible, split the tail of the sequence by lane. As of 2026-07-23
main's max is `202607780000`, so:

| Lane | Reserved migration range |
|---|---|
| **CURSOR** | `202607790000` – `202607799999` (…790000, 791000, …) then `2026078` even-thousand blocks it opens |
| **CLAUDE** | `202607800000` – `202607809999` (…800000, 801000, …) |

> **⚠ CORRECTED 2026-07-25 — the reserved blocks above are now BELOW main's max and cannot be used.**
> Main's max migration is `202607930000`, so both reserved blocks are exhausted/overtaken. The two
> rules in force contradicted each other: this table says "claim your reserved block", while
> `CLAUDE.md` §2 and `docs/specs/PER-PR-CHECKLIST.md` §7 say "strictly above main's current max,
> re-checked at push time".
>
> **RESOLUTION — the hard invariant wins:** always claim the next free number **strictly above
> main's current max**, re-checked at push time. A number below main's max would apply out of order
> on a fresh from-0001 CI database, which is the failure the invariant exists to prevent; a lane
> collision merely causes a rename. To keep lanes apart *above* the max, take the next free
> **even-thousand** block and record it here in the same PR:
>
> | Claimed above main's max | Lane | Migration |
> |---|---|---|
> | `202607940000` | CLAUDE | `202607940000_load_cancellations_drop_legacy_reason_fk.sql` (HELD) |

Rule: **claim the next free number in your own reserved block, and re-check at push time** (the same
discipline as verify-steps). When a lane exhausts its block, it opens the next `…N0000` block that no
migration or open PR in either lane has claimed, and records it here in the same commit. A migration
number is never reused even after a renumber — the abandoned number stays burned.

---

## 3. Shared files — FORBIDDEN to both lanes

Do not edit, in either lane, for any reason:

- `package.json` — adding `verify:*` entries is forbidden (`STOP-THE-THRASH-WORKORDER-2026-07-17`)
  **and inert** (no workflow runs them). Wire guards via `verify-steps/` only.
- `.github/workflows/locked-guards.yml`, `.github/workflows/ci.yml`
- `docs/schema-parity-baseline.json` (regenerate only through its explicit env-gated path)
- `CLAUDE.md`, `AGENTS.md`, `docs/specs/DEFINITION-OF-DONE.md` — owner-governed; propose in chat instead.

---

## 4. Merge authority

- **Neither lane merges its own PRs.** The owner merges, or applies `JORGE-APPROVED`.
- **Neither lane merges the other lane's PRs.** Ever. (An agent once auto-merged and fabricated owner
  approval — that is why this line exists.)
- Financial cluster, migrations, `accounting.*`/`catalogs.*`/`mdata.*` schema-or-data: **owner-gated
  regardless of lane.**

---

## 5. In-flight work Cursor must not collide with (as of 2026-07-23 11:10 CT)

- **PR #3336 — OPEN, touches 26 frontend files across many modules**, including
  `apps/frontend/src/pages/accounting/ItemsCatalog.tsx`. It routes every base-less `fetch` through
  `resolveApiUrl()`. **Cursor: rebase onto main AFTER #3336 lands before touching any frontend file**,
  or expect conflicts in accounting/banking pages.
- Merged and live (`77d6461`): #3334 (safety KPIs), #3335 (dispatch cancellation labels).
- `scripts/verify-steps/1321`, `1322`, `1323`, `1324` are Claude's — do not renumber.

---

## 6. Confirmed, prod-verified defects handed to CURSOR (accounting + banking)

All verified against the Neon prod branch this session. Evidence included so Cursor does not re-derive.

### A. Settlement bill-payment posting path is dead — **OWNER-GATED (financial)**
`apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts:132`
`resolveDipBankAccountId` INNER-JOINs `catalogs.account_role_bindings` for `role_key='cash_dip'`.
- `catalogs.account_role_bindings` has **0 rows on prod** (RLS-immune `n_live_tup`), and
  `accounting/coa-roles/resolver.service.ts:36` already documents it as "(empty in prod)" legacy.
- PR #3109 repointed the sibling posters to `accounting.chart_of_accounts_roles`; **this one was missed.**
- `cash_dip` is **not designated on `chart_of_accounts_roles` for ANY of the three entities**, so the
  repoint alone is insufficient — it also needs owner role designation.
- Fails closed (returns null → caller throws). No corruption; the path is simply non-functional.

### B. `driver_pay_expense` not designated for any entity — **OWNER ACTION**
`driver-finance/settlement-payrun-close.service.ts` throws `DRIVER_PAY_ACCOUNT_MISSING`. Verified: the
role is absent for TRANSP, TRK and USMCA. Correct fail-closed behaviour; needs the designation.

### C. `catalogs.account_role_bindings` global unique — **latent, migration → owner-gated**
Prod has BOTH `account_role_bindings_role_key_key` `UNIQUE(role_key)` (no entity column) and
`uq_account_role_bindings_company_role_key` `UNIQUE(operating_company_id, role_key)`. The per-entity
constraint was added; **the global one was never dropped.** Harmless while the table is empty; blocks
per-entity binding the moment it is used.

### D. `accounting.chart_of_accounts_roles` entity scope — **UNVERIFIED, needs an authenticated check**
With the GUC pinned to TRANSP, rows from all three entities were visible (TRANSP 15 / TRK 15 / USMCA 13).
**This may be a tool artifact:** `run_sql` and `run_sql_transaction` enforce RLS differently
(`current_user=ih35_app`, `session_user=neondb_owner`). Settle it via an **authenticated API request**,
not psql. Do not report a leak without that.

### E. `is_postable` not enforced on the cash-GL bind path — **OWNER-GATED**
`apps/backend/src/banking/banking.routes.ts:548-553, 585-589`.

### F. Banking PRs merged but **never verified live**: #3312, #3314. #3305 was closed as superseded by
#3323. Verify against prod before treating any as done.

### G. `safety.civil_fines` has two conflicting CHECK constraints
`fines_status_check` omits `'voided'` while `chk_civil_fines_status_voidable` includes it. Both must
pass, so `status='voided'` is **unreachable** — voiding must use `voided_at`. Migration → owner-gated.
(Safety-owned table, but constraint-level; flagged here so it is not lost.)

---

## 7. Both lanes: the non-negotiables

1. **Prod wins.** Verify schema against Neon prod, never migrations or memory.
2. **A 0 is not absence — re-run it.** RLS masks `accounting.*`/`catalogs.*`/`mdata.*` to 0. Include a
   visibility sanity check before trusting a count.
3. **A 200 is not success.** The SPA origin returns `index.html` with HTTP 200 for unknown `/api` paths.
   Check content-type.
4. **Every fix ships a guard** that fails on the bug and passes on the fix, with a `--selftest` that can
   actually fail *and* asserts the corrected shape is not flagged.
5. **Rule 16 evidence block in every PR** — ROOT CAUSE / FIX / GUARD / LIVE PROOF or UNVERIFIED /
   REMAINING. Enforced by `verify-definition-of-done-evidence` (step 1324).
6. **Findings from code reading are UNVERIFIED** until checked against prod or exercised live. Label
   them that way. In one module audit, 3 of 6 P0s were false and the worst defect was in no finding.
