# USMCA ENTITY LAW — PERMANENT (owner-locked 2026-08-12)

**Answered = closed. Do not re-ask.**

## 1. USMCA has NO QuickBooks

USMCA is **TMS-authoritative from day one**. There is **no QBO realm, no QBO connection, and no QBO sync** for USMCA.

## 2. Posting flags — ALL ON for USMCA (permanent)

**Every TMS GL / subledger posting flag is ON for USMCA** — permanently, without waiting for chat approval each time.

Includes (non-exhaustive): `GL_POSTING_ENABLED`, `BILL_GL_POSTING_ENABLED`, `BILL_PAYMENT_GL_POSTING_ENABLED`, `EXPENSE_GL_POSTING_ENABLED`, `INVOICE_AR_GL_POSTING_ENABLED`, `CUSTOMER_PAYMENT_GL_POSTING_ENABLED`, `BANK_FEED_GL_POSTING_ENABLED`, `SETTLEMENT_GL_POSTING_ENABLED`, `TRANSFER_GL_POSTING_ENABLED`, `REVENUE_RECOGNITION_POST_ENABLED`, `DRIVER_ADVANCE_GL_POSTING_ENABLED`, `PREPAID_EXPENSES_POST_ENABLED`, `FINANCE_HUB_AMORTIZATION_POST_ENABLED`, and every other `*_GL_POSTING_*` / `*_POSTING_ENABLED` / enrolled posting-class flag **except QBO write-back keys below**.

**Mechanism:** `lib.feature_flag_overrides` rows with `operating_company_id = org.companies WHERE code = 'USMCA'` and `enabled = true`.

**Migration that encodes this:** `db/migrations/202608121800_usmca_posting_on_qbo_off.sql`

## 3. QuickBooks — ALL OFF for USMCA (permanent)

**Every QBO-related flag is OFF for USMCA** — permanently:

| Class | Examples (force `enabled = false`) |
|-------|-------------------------------------|
| Write-back | `QBO_JE_PUSH_ENABLED`, `QBO_ENTITY_PUSH_ENABLED`, `VOID_QBO_MIRROR_ENABLED` |
| Reconcile / UI | `TMS_QBO_RECON_ENABLED`, `QBO_RECONCILE_UI_ENABLED` |
| Mirror pull / projection | any `flag_key LIKE 'QBO_%'` |
| Master-data heal | `QBO_MASTER_DATA_HEAL_ENABLED` |
| AP import from QBO | `AP_IMPORT_ENABLED` (QBO-origin path) |

**Never** enable QBO sync, pull, projection, reconcile, or write-back for USMCA. **Never** tell the owner USMCA needs QBO setup.

TRANSP + TRK keep parallel-books law (QBO mirror + reconcile where connected; write-back stays OFF globally).

## 4. Who applies

**CC-1 (Claude Coder)** applies the migration on Neon prod on merge. **No owner hand-apply.** Proof = override row counts in the same PR body.

## 5. Companion

Wire-first sprint (build before Chrome audit): `docs/lockdown/WIRE-FIRST-SPRINT-LAW-2026-08-12.md`

Supersedes any stale line that says “ask Jorge to flip posting flags” **for USMCA TMS posting**. QBO paths for USMCA remain permanently OFF.
