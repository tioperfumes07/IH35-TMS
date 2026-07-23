# SESSION HANDOFF — Restart exactly here (2026-07-22 ~14:25 CT)

**Owner said:** Claude is removing the Manual JE $1k threshold on PR #3231. Cursor continues Accounting wave. Computer battery — session pausing.

**Paste this file path to the next Cursor agent as first instruction:**
`~/Desktop/IH35-CURSOR-AUDIT/SESSION-HANDOFF-RESTART-2026-07-22.md`

Also load:
- `~/Desktop/cursor-rules-for-coding/00-START-HERE/FULL-AUDIT-LAW-AGREED-2026-07-22.md`
- `~/Desktop/cursor-rules-for-coding/00-START-HERE/README.md`
- Transcript (prior chat): agent-transcripts `6e35fa40-dea1-4280-90b4-213b2a381598`

---

## Owner intent (locked — do not renegotiate)

1. **Full audit law** on every tab/function: visual + picker/+Create/QBO wizard + deep linkage + economics + entity scope (TRANSP + USMCA).
2. Module order: **Accounting → Banking → … → compliance last**.
3. Cursor opens PRs; **Claude merges**; Jorge does **not** review diffs.
4. Money HOLD unlocks with one sentence / `JORGE-APPROVED`.
5. **Picker law:** every filter has real catalog; inline **+ Add new / + Create**; QBO wizard; writes canonical table; appears after save; entity-scoped.

---

## DO NOT do on restart

- Do **NOT** touch PR **#3231** threshold removal — Jorge told **Claude** to remove it (Option A). Leave that PR to Claude.
- Do **NOT** edit `package.json` / locked-guards / ci.yml for new guards (Rule 17) — only `scripts/verify-*.mjs` + `scripts/verify-steps/NNN-*.mjs`.
- Do **NOT** self-merge money PRs.
- Do **NOT** fight Claude on #3231.

---

## Active worktree (CONTINUE HERE)

| Item | Value |
|------|--------|
| Path | `/Users/jorgemunoz/IH35-TMS/.worktrees/acct-receive-payment-deposit-20260722` |
| Branch | `fix/acct-receive-payment-deposit` |
| Base | recent `origin/main` (HEAD was `7d5de02e9` when paused) |
| Goal | **PR 7/M** — Receive Payment: kill `ops_checking`; real deposit CoA/Banking picker |
| PR | **NOT OPENED YET** — finish code → commit → push → `gh pr create` as **7 of M** |

### Partial work already on disk (UNCOMMITTED)

**Only file changed so far:**
`apps/backend/src/accounting/payments.routes.ts`

What was started:
- `deposited_to_account_id` zod → `.uuid().optional()` (was free-text)
- On create: if UUID provided → validate `catalogs.accounts` for entity; else fallback to `undeposited_funds` / `cash_clearing` from `accounting.chart_of_accounts_roles`; **removed** `"ops_checking"` default

**Still TODO in this PR (finish before open):**

1. **FE** `apps/frontend/src/pages/accounting/RecordPaymentModal.tsx`
   - Remove hardcoded `depositedTo = "ops_checking"` free-text input
   - Deposit picker: CoA Asset / Undeposited Funds / bank accounts via `ledger_account_id`
   - Prefer `ReferenceSelect` + `createKind="account"` (+Create wizard) OR Combobox + nested create like Pay Bill PR #3235
   - APIs: `getCoaAccounts(opco)`, `getAllAccounts(opco)`, `listCoaRoles(opco)` for UF default
   - Submit **only** `deposited_to_account_id` = **catalogs.accounts UUID** (posting engine uses it as GL debit)

2. **BE** `apps/backend/src/accounting/customer-payments.routes.ts`
   - Still inserts `body.data.bank_account_id ?? "ops_checking"` into `deposited_to_account_id` — **wrong**
   - Fix: if `bank_account_id` → resolve `banking.bank_accounts.ledger_account_id`; else UF/cash_clearing via `resolveRoleAccountOptional`
   - Prefer importing `resolveRoleAccountOptional` from `coa-roles/resolver.service.ts` (payments.routes raw SQL should be upgraded to same helper)

3. **Optional defensive** `posting-engine.service.ts` `buildCustomerPaymentLines`:
   - If stored value is `ops_checking` / non-uuid → `resolveCashLikeAccountForCompany`
   - If value is bank UUID → map to `ledger_account_id`
   - Money-touching: keep minimal; flag HOLD if expanding GL math

4. **Guard (Rule 17):**
   - `scripts/verify-acct-receive-payment-deposit.mjs`
   - `scripts/verify-steps/1255-verify-acct-receive-payment-deposit.mjs`
   - Assert: no `ops_checking` in RecordPaymentModal / payments create defaults; deposited_to is uuid-validated

5. Open PR titled like: `fix(accounting): Receive Payment deposit CoA picker (7/M)`

### Design fact (critical — do not regress)

`deposited_to_account_id` is a **GL account id** (`catalogs.accounts`), NOT a bank display slug.
Bank → GL bridge: `banking.bank_accounts.ledger_account_id`.
Fallback roles: `undeposited_funds` then `cash_clearing`.

Standing bug class (other PRs): `mdata.vendors.id` uuid vs `accounting.bills.vendor_id` text → always `v.id::text = text_col`. Guard: `verify-uuid-text-join-casts.mjs`.

---

## Accounting PR wave status

| N | PR | Branch | Status |
|---|-----|--------|--------|
| 1 | #3229 Bill detail reverse | — | **Merged** |
| 2 | #3230 Bill payment reverse + uuid/text guard | — | **Merged** |
| 3 | #3232 Allocations | — | Open (babysit if needed) |
| 4 | **#3231 Manual JE hub** | — | Open — **Claude removing $1k threshold**; leave alone |
| 5 | #3234 Vendor Bill/Expense QBO + USMCA catalogs | `fix/acct-wizard-qbo-parity` | Open |
| 6 | #3235 Pay Bill bank picker +Create | `fix/acct-pay-bill-bank-picker` | Open — pattern to copy for deposit picker |
| 7 | Receive Payment deposit | `fix/acct-receive-payment-deposit` | **IN PROGRESS** (this handoff) |
| 8 | #3236 A/P `createKind=account` | `fix/acct-ap-createkind-account` | Open |

Verify-step numbers already claimed by open PRs:
- 1252 = wizard QBO (#3234)
- 1253 = pay-bill bank (#3235)
- 1254 = ap createKind (#3236)
- **1255 = use for receive-payment**

### After 7 ships — next ranked

Source: [Next Accounting FAIL inventory](44cbc6de-4237-40ce-b8b8-ee107cffaa08) (2026-07-22).  
Note: inventory labeled **6/M–12/M** relative to in-flight **5/M** wizard; **6** and **8** are already open as #3235 / #3236 — do not re-open duplicates.

| Rank | Surface | Status | Suggested title / files |
|------|---------|--------|-------------------------|
| 6 | Pay Bill bank picker/+Create | **OPEN #3235** | `PayBillModal.tsx` — Combobox + nested Plaid; guard 1253 |
| 7 | Receive Payment `ops_checking` | **THIS WORKTREE** | `RecordPaymentModal.tsx` + `payments.routes.ts` + `customer-payments.routes.ts` (+ optional posting soft-resolve); guard **1255** |
| 8 | A/P `createKind=account` | **OPEN #3236** | `VendorBillForm.tsx`, `CreateMultipleBillsPage.tsx`, ApplyToBill; guard 1254 |
| 9 | Recurring Bill QBO wizard depth | Next after 7 | `RecurringBillCreate.tsx` / List + template line `account_id`; not thin full page |
| 10 | Multiple Bills row parity | After 8 | class/unit/driver/WO + shared `VendorBillForm` helpers |
| 11 | Scope `listCatalogAccounts` | After 9/10 | **Not** Accounting FE (already clean); VendorDetail, ApplyToBillForm, RecordCCPaymentModal, Vendor/Customer create |
| 12 | Claim→WO→Bill/Expense FKs | **HOLD** + Neon | additive FKs + create-from-claim UI; `JORGE-APPROVED` |

Do **not** renumber into 6+: #3231 Manual JE · #3232 Allocations · 5/M wizard #3234.

When Accounting click-through + PRs complete → **Banking** same full audit law.

---

## Claude coder merge lessons (absorb)

| PR | Lesson |
|----|--------|
| #3228 | Claim INSERT RLS / held-column probe / economics on reverse |
| #3229 | `uuid = text` join 500s → cast uuid side `::text` |
| #3230 | Bill payment reverse + table-qualified uuid/text guard |
| #3231 | **Unauthorized $1k Owner threshold invented** → Jorge: **remove (Option A)**; Claude doing that |

---

## Entities (Neon)

- TRANSP `91e0bf0a-…`
- TRK `b49a737b-…`
- USMCA `5c854333-…`
- Units: scope by `owner_company_id OR currently_leased_to_company_id` (no `operating_company_id` on units)
- CoA roles: need company GUC; bypass alone can false-empty

---

## coord-main note

Worktree `coord-main` is on unrelated branch `fix/weekly-close-applies-deductions` (messy local docs). **Do not build 7/M there.** Use `acct-receive-payment-deposit-20260722`.

Canonical law copies also at:
- `docs/specs/FULL-AUDIT-LAW-AGREED-2026-07-22.md` (may be untracked on coord-main)
- Desktop `IH35-CURSOR-AUDIT/FULL-AUDIT-LAW-AGREED-2026-07-22.md`

---

## Restart checklist (exact order)

1. Read this handoff + FULL-AUDIT-LAW.
2. `cd /Users/jorgemunoz/IH35-TMS/.worktrees/acct-receive-payment-deposit-20260722`
3. `git status` — confirm `payments.routes.ts` still modified; do not lose it.
4. Finish FE RecordPaymentModal + customer-payments.routes + guard 1255.
5. Commit + push + open PR as **7/M**.
6. Optionally `cursor-app-control` `move_agent_to_root` → that worktree.
7. Check #3231 only for status (Claude threshold removal) — do not edit.
8. After 7 PR open → start **9/M** Recurring Bill (or babysit green CI on 5/6/8).

---

## Progress header template (Rule 20)

```
BLOCK: PR#7/M / Receive Payment deposit CoA
MODULE: accounting
PROGRESS: ~6 of ~12 ranked accounting PRs in flight · Accounting pending still large in piles
STATUS: Finishing ops_checking kill + deposit picker; leave #3231 to Claude
```

---

## Conversation pointer

Prior Cursor transcript UUID: `6e35fa40-dea1-4280-90b4-213b2a381598`  
Title hint: Accounting audit / PR wave / Receive Payment deposit

Saved: 2026-07-22 by Cursor agent before battery pause.
