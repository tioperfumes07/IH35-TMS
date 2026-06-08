# IH35 Transport — Chart of Accounts Role Bindings
## Bookkeeper Approval Worksheet

**Purpose:** The IH35-TMS posting engine resolves journal-entry control accounts by *role* (e.g. `ar_clearing`, `fuel_expense`) rather than by hard-coded account numbers. Each role must be bound to exactly one account in the Chart of Accounts. This worksheet documents the proposed bindings, records Jorge's pre-verified rows, and captures the bookkeeper's authoritative decision on any row still requiring designation.

**What you need to do:**
- Review every row marked ✅ VERIFIED — these were confirmed by operations and need only your sign-off.
- For every row marked ⚠️ DECISION REQUIRED — select one account from the options provided and enter it in the **BOOKKEEPER CHOICE** column.
- Return the completed worksheet to operations. Do not guess — if uncertain, contact the CPA.

**Database queried:** `catalogs.accounts` (Neon / IH35-TMS production) — all results below reflect live, non-deactivated accounts as of the date of this worksheet.

---

## Section 1 — Pre-Verified Bindings (Operations Confirmed)

> These bindings were reviewed and confirmed by Jorge Munoz. Bookkeeper signature below serves as final accounting approval.

| Role | Proposed Account | Account Number | Status | Bookkeeper Sign-Off |
|------|-----------------|----------------|--------|---------------------|
| `ar_clearing` | Accounts Receivable | 1100 | ✅ VERIFIED | ☐ |
| `ap_clearing` | Accounts Payable | 2000 | ✅ VERIFIED | ☐ |
| `cash_payroll` | WF - Payroll 6129 | *(QBO bank account)* | ✅ VERIFIED | ☐ |
| `cash_petty` | Practica-Petty Cash | *(QBO bank account)* | ✅ VERIFIED | ☐ |
| `fuel_expense` | Fuel Expense | 6100 | ✅ VERIFIED | ☐ |
| `driver_payroll_clearing` | Driver Cash Advance | QBO-149 | ✅ VERIFIED | ☐ |
| `undeposited_funds` | Undeposited Funds | QBO-168 | ✅ VERIFIED | ☐ |

---

## Section 2 — Decision Required

> For each row below, the bookkeeper must select ONE account and write it in the **BOOKKEEPER CHOICE** column. All candidates are active, non-deactivated accounts pulled directly from `catalogs.accounts`.

---

### 2.1 — Role: `cash_dip`
**Description:** The primary operating bank account under Ch. 11 DIP (Debtor-in-Possession) status. Designate which bank account serves as the DIP operating account. This account will be debited when DIP-period cash receipts are posted and credited when DIP-period disbursements are recorded.

> **⚠️ UPDATED Jun 7 2026:** Jorge confirmed DIP accounts = Wells Fargo accounts. BOA-CHECKING-1135 was **closed December 2025** and has been removed as an option. WF accounts below are sourced live from `catalogs.accounts` (Neon query run Jun 7 2026).

*Query used:* `SELECT id, account_number, account_name FROM catalogs.accounts WHERE account_name ILIKE '%wells%' OR account_name ILIKE '%WF%' OR account_name ILIKE '%wachovia%' AND deactivated_at IS NULL`

| # | Account Number | Account Name | Account Type | Select? |
|---|---------------|-------------|--------------|---------|
| A | `QBO-1150040141` | WF - General Operating 6103 | Asset | ✅ **BOOKKEEPER CHOICE** |
| B | `QBO-1150040142` | WF - Savings 6137 | Asset | ☐ |
| C | `QBO-1150040143` | WF - Payroll 6129 | Asset | ☐ (already bound to `cash_payroll` in Section 1) |

> ~~`QBO-1150040124` BOA-CHECKING-1135~~ — **REMOVED: account closed December 2025.**

**BOOKKEEPER CHOICE:** `QBO-1150040141` — WF - General Operating 6103 *(pending bookkeeper initials — confirm tomorrow)*

**Notes / Rationale:** Jorge confirmed Wells Fargo is the active DIP banking relationship. General Operating 6103 is the primary operating checking account. Savings 6137 excluded (savings, not operating). Payroll 6129 already assigned to `cash_payroll` role.

---

### 2.2 — Role: `maintenance_expense`
**Description:** The expense account to debit when vehicle maintenance and repair costs are posted (AP invoices from internal shop and external vendors). Select the single account that will serve as the *default* maintenance expense control account in the posting engine.

*Query used:* `SELECT id, account_number, account_name FROM catalogs.accounts WHERE account_name ILIKE '%maintenance%' OR account_name ILIKE '%repair%' AND deactivated_at IS NULL`

| # | Account Number | Account Name | Account Type | Select? |
|---|---------------|-------------|--------------|---------|
| A | `QBO-1150040004` | Office Building-Repair & Maintenance | Expense | ☐ |
| B | `QBO-1150040031` | Repair & Maintenance Expenses | Expense | ☐ |
| C | `QBO-1150040042` | Internal Mechanic Shop Maintenance and Repairs (645.30) | Expense | ☐ |
| D | `QBO-1150040055` | Uninsured Accident Vehicle Repair | Expense | ☐ |
| E | `QBO-1150040091` | Driver Accident Damages & Repairs | Expense | ☐ |
| F | `QBO-1150040178` | Road Service-Repairs (645.30) | Expense | ☐ |
| G | `QBO-15` | External Mechanic Shop Maintenance and Repair (645.30) | Expense | ☐ |

**BOOKKEEPER CHOICE:** _______________________________

**Notes / Rationale:** ___________________________________________________________________

> **⚠️ UPDATED Jun 7 2026:** Jorge confirmed maintenance expense mapping follows the QBO Products & Services / Items pattern — different maintenance item types map to different expense accounts. A single default `maintenance_expense` binding may not be appropriate. **Pending Claude's QBO Products & Services inspection** to identify exact item-to-account mappings before a binding is confirmed here.
>
> See QBO Products & Services query for exact item-to-account mapping. Different items map to different expense accounts. Pending QBO inspection.

> **Note:** Options D and E (accident/damage repairs) are typically coded to insurance expense or a separate damage account — confirm with CPA whether they should remain distinct from routine maintenance.

---

### 2.3 — Role: `factor_advances_receivable`
**Description:** The asset account to debit when the company advances funds through a factoring facility (i.e., the receivable owed from the factoring company before invoice payment is received). Select the account that represents the primary DR account for factoring advance receivables — typically a "Factoring Reserves" or factoring trust account balance.

*Query used:* `SELECT id, account_number, account_name FROM catalogs.accounts WHERE account_name ILIKE '%factor%' OR account_name ILIKE '%FARO%' OR account_name ILIKE '%RTS%' AND account_type = 'Asset' AND deactivated_at IS NULL`

> **⚠️ UPDATED Jun 7 2026:** Jorge confirmed currently using **FARO only**. Not yet transitioned to RTS. RTS options retained for reference but are not active.

| # | Account Number | Account Name | Account Type | Select? |
|---|---------------|-------------|--------------|---------|
| A | `QBO-1150040080` | Faro Factoring Reserves | Asset | ✅ **BOOKKEEPER CHOICE — confirmed by Jorge** |
| B | `QBO-1150040084` | Faro Escrow Account | Asset | ☐ (Faro reserve/escrow — see `factor_reserve_held` role) |
| C | `QBO-1150040098` | FARO FACTORING | Asset | ☐ |
| D | `QBO-125` | Factoring Reserves Love's Solutions | Asset | ☐ |
| E | `QBO-247` | RTS FINANCIAL-VIRTUAL ACCT | Asset | ☐ (RTS not yet active) |
| F | `QBO-248` | RTS-Factoring Reserves | Asset | ☐ (RTS not yet active) |

**BOOKKEEPER CHOICE:** `QBO-1150040080` — Faro Factoring Reserves *(confirmed by Jorge Jun 7 2026)*

**Notes / Rationale:** Jorge confirmed FARO is the active factoring company. RTS transition has not occurred. When RTS transition occurs, add a separate role binding `factor_advances_receivable_rts` — do not reassign this binding.

> **Guidance:** If the company factors with multiple companies simultaneously, the posting engine supports separate role bindings per factoring relationship (e.g., `factor_advances_receivable_faro`, `factor_advances_receivable_rts`). Confirm with operations which factoring company is primary, or whether per-company roles are needed.
>
> **RTS note:** RTS not yet active — when RTS transition occurs, add separate role binding `factor_advances_receivable_rts`.

---

### 2.4 — Role: `factor_chargebacks_payable`
**Description:** The liability account to credit when a factoring company issues a chargeback (i.e., claws back a previously advanced amount due to a disputed or uncollected invoice). This represents a current liability until the underlying dispute is resolved or repaid.

*Query used:* `SELECT id, account_number, account_name FROM catalogs.accounts WHERE account_type = 'Liability' AND (account_name ILIKE '%factor%' OR account_name ILIKE '%loan%' OR account_name ILIKE '%payable%') AND deactivated_at IS NULL`

| # | Account Number | Account Name | Account Type | Select? |
|---|---------------|-------------|--------------|---------|
| A | `2000` | Accounts Payable | Liability | ☐ |
| B | `QBO-47` | Accounts Payable (A/P) | Liability | ☐ |
| C | `QBO-1150040081` | Faro Loan | Liability | ☐ |
| D | `QBO-1150040127` | RTS-Loans | Liability | ☐ |
| E | `QBO-286` | RTS - NEWCO LOAN | Liability | ☐ |

**BOOKKEEPER CHOICE:** *(cannot bind — no suitable account exists yet)*

**Notes / Rationale:** ___________________________________________________________________

> **⚠️ UPDATED Jun 7 2026 — ACTION REQUIRED:** Jorge confirmed **no existing account** tracks factoring chargebacks. None of the options above are appropriate for this role. **Next steps:**
> 1. Create a new liability account in QBO: **"Factoring Chargebacks Payable"** (Current Liability).
> 2. Sync the new account to `catalogs.accounts` (via QBO sync or manual insert).
> 3. Return to this worksheet and bind `factor_chargebacks_payable` to the new account number.
>
> See **`docs/accounting/FACTORING-ACCOUNTING-STRUCTURE.md`** for full accounting context on this account.
>
> **Guidance:** If no existing liability account specifically tracks factoring chargebacks, a new "Factoring Chargebacks Payable" account may need to be created in QBO and synced to the catalog. Notify operations if this is the case.

---

## Section 3 — Auto-Rejected Accounts

Any account whose name contains the word **(deleted)** is automatically rejected by the posting engine and **cannot** be used as a role binding target. No action is required for these accounts — they are listed here for transparency only.

If an account you intended to select appears on this list, contact operations to restore or recreate the account before proceeding.

*To audit: `SELECT account_number, account_name FROM catalogs.accounts WHERE account_name ILIKE '%(deleted)%';`*

---

## Section 4 — Instructions for Bookkeeper

1. **Fill in the BOOKKEEPER CHOICE column** for each ⚠️ row in Section 2. Write the account number and name clearly.
2. **Initial each ☐ checkbox** in Section 1 to confirm sign-off on all pre-verified bindings.
3. **Add notes** in the Notes / Rationale field if any choice is conditional, approximate, or requires a follow-up account to be created.
4. **Return completed worksheet** to operations (Jorge Munoz) for entry into the system via `/accounting/settings/coa-roles`.
5. **Do not guess** — if you are uncertain about the correct account, contact the CPA before completing this worksheet.
6. This worksheet is **not a journal entry** — it configures how the posting engine will create journal entries going forward.

---

## Section 5 — Certification

By signing below, I certify that I have reviewed the proposed chart-of-accounts role bindings in this worksheet, that the pre-verified bindings in Section 1 are consistent with the company's accounting practices, and that the designations I have entered in Section 2 reflect the correct accounts for each described role.

| | |
|---|---|
| **Verified by (print name):** | _____________________________________ |
| **Title:** | _____________________________________ |
| **Signature:** | _____________________________________ |
| **Date:** | _____________________________________ |
| **Reviewed with CPA?** | ☐ Yes &nbsp;&nbsp; ☐ No — CPA review not required |
| **CPA Name (if applicable):** | _____________________________________ |

---

*Generated by IH35-TMS operations · Document version: 1.1 · Database: `tiny-field-89581227` (IH35-TMS / Neon) · Branch: feat/factoring-accounting-structure · Last updated: Jun 7 2026 by Claude (Jorge confirmed)*
