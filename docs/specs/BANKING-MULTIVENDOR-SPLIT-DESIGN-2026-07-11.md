# UI-03 PART B — Banking Multi-Vendor Split → balanced GL — Design & Verify-First Report

**Date:** 2026-07-11 · **Tier:** FINANCIAL Tier-1 (build-and-hold) · **Status:** ★ **ALREADY BUILT, flag-gated OFF**
**Author:** coder (verify-first per skill §0) · **Decision owner:** GUARD proof + owner (Jorge) Neon ceremony

> GUARD/owner instruction (2026-07-11): *"UI-03 PART B … build the DESIGN DOC + build-and-hold the GL
> assembly behind the existing OFF flag ONLY. Do NOT wire live posting, do NOT flip any flag."*
> **Finding: the build-and-hold already exists.** This doc records what is built (with evidence), the one
> design divergence from the block spec that needs an owner/GUARD ruling, and the exact steps left before
> anyone enables it. **Nothing in this PR posts, wires, or flips a flag** — it is documentation only.

---

## 1. Executive summary

The banking multi-vendor split — split ONE cash/check disbursement (e.g. $1,000) across MULTIPLE vendors AND
categories in one transaction — is **implemented front-to-back and gated OFF by two default-OFF flags**. It is
in exactly the build-and-hold state the block asks for. It was **not rebuilt** (verify-first).

- **Frontend** `BankTransactionSplitModal.tsx` — `single_vendor_multi_category` **and** `multi_vendor` modes,
  per-line Vendor / Category / Item / Class / Customer / Memo / Amount, exact tie-out, `+ Add line`, mounted on
  the live surface (`BankingTransactionsDesignView`). Inline `+ Add new product/service` present per line.
- **Backend** `bank-transaction-splits.service.ts` — `saveSplitDraft` (validates lines sum EXACTLY to the txn
  total, fail-loud) + `commitSplit` (per-line posting behind the GL flag) + forward/reverse drill-through.
- **Flags** (both default OFF): `BANK_TX_SPLIT_ENABLED` (gates persist/commit/void) and
  `BANK_TX_SPLIT_GL_POSTING_ENABLED` (gates the actual GL posting). Split tables created in migration
  `202607110100_banking_split_transactions_and_trailer_link.sql`.

**One open design decision (§4):** the current build posts **one bill per vendor line** (each vendor gets its
own A/P + 1099), whereas the block text says *"Post creates ONE balanced JE … single credit to cash for the
total."* The per-vendor-bill model **better** satisfies the block's own requirement that *each line's vendor
portion be traceable for that vendor's A/P aging and 1099 totals*. This needs an owner/GUARD ruling before enable.

---

## 2. Verify-first evidence (skill §0 — cite file:line, not memory)

| Requirement (block UI-03 PART B) | Built? | Evidence |
|---|---|---|
| `multi_vendor` mode (different vendors per line) | ✅ | `bank-transaction-splits.service.ts` `SplitMode = "single_vendor_multi_category" \| "multi_vendor"`; UI `BankTransactionSplitModal.tsx:64,267-268,314-319` (mode toggle + per-line vendor picker) |
| Per-line Vendor/Category/Item/Class/Customer/Memo/Amount | ✅ | UI `BankTransactionSplitModal.tsx:313-369` (multi_vendor grid) |
| Lines SUM EXACTLY to total or Post blocked (fail loud) | ✅ | service `saveSplitDraft`/`validate` `:246-250` throws `Split lines total … must sum exactly` |
| Each line's expense attributed to its OWN vendor (A/P + 1099) | ✅ | per-line `vendor_id`; commit posts a vendor bill per line (reuses `bulkPostTransactionsAsBills` shape) `:27-30,~455` |
| Single cash/bank disbursement for the total | ✅ (as the split parent) | parent flips to `status='split'`; each line's bill is paid from the one bank txn `:405-411` |
| Forward + reverse drill-through | ✅ | `getSplitLines` / `getSplitLinesByLinkage(driver/unit/trailer/load/vendor)` `:117,156-200` |
| Re-post / double-book guard (idempotent commit) | ✅ | RE-POST GUARD skips `posted`/`void` lines `:380-393,455-460` |
| Behind per-entity OFF flag, fail loud when OFF | ✅ | `BANK_TX_SPLIT_ENABLED` + `BANK_TX_SPLIT_GL_POSTING_ENABLED`, both default OFF `:38-40,51-52`; commit throws `feature_disabled` when off `:349-352`; line marked `skipped_pending_gl_wiring / flag_off` when GL flag off `:452-458` |
| "Split N ways by driver" helper | ⚠️ **UNVERIFIED — needs live check** | not found in `BankTransactionSplitModal.tsx`; driver *lines* are supported (cash-advance branch) but a one-click "split 14 ways by driver" helper was not located — likely a **gap/deferred** |
| Inline "+ Create" on every per-line dropdown (PART A overlap) | ◑ partial | `+ Add new product/service` present `:369`; per-line Vendor/Category/Class inline-create = confirm in PART A sweep |

**Flag live-state (per entity):** default OFF is code-verified (no seed/override rows reference `BANK_TX_SPLIT*`
in `db/migrations/`). The **effective** per-entity value on prod is **UNVERIFIED — needs owner prod check (§1.5)**;
do not assume.

---

## 3. Architecture as built

```
BankTransactionSplitModal (live, on BankingTransactionsDesignView)
  mode: single_vendor_multi_category | multi_vendor
  lines[]: { vendor_id?, gl_account_id (category), item?, class?, customer?, memo, amount_cents }
  guard: Σ amount_cents === abs(txn.amount_cents)   ← Post blocked otherwise
      │  saveSplitDraft()  → banking.bank_transaction_splits (draft, per-line)
      ▼
commitSplit()  [BANK_TX_SPLIT_ENABLED must be ON, else throws feature_disabled]
  parent bank_txn → status='split'
  for each line (skip already posted/void):
     if BANK_TX_SPLIT_GL_POSTING_ENABLED is OFF → mark skipped_pending_gl_wiring/flag_off (no posting)
     else:
       cash-advance line (driver + advance-receivable acct) → createEmployeeLoanCore / disburseDriverAdvanceCore
       vendor line (vendor_id)                              → vendor BILL (reuses bulk-post-as-bill shape)
                                                              → paid from the split bank transaction
  → each line result_bill_id / result_driver_advance_id / result_journal_entry_id recorded on the split row
```

Reuses existing posting infra (`bulkPostTransactionsAsBills`, cash-advance core, `resolveAccountForCategory`).
**No new GL math.** Tenant-scoped (`operating_company_id`) + FORCED RLS. Append-only outcome markers.

---

## 4. The one design decision for owner/GUARD — single-JE vs per-vendor-bill

**Block text:** "Post creates ONE balanced entry — for each line a debit to its expense/category ACCOUNT
tagged with THAT line's VENDOR, and a single credit to the cash/bank account for the total."

**As built:** each vendor line becomes its **own bill** (then paid from the one split bank txn), and driver
lines route through the cash-advance core.

**Recommendation — KEEP the per-vendor-bill model** (do not refactor to a single lumped JE):

1. The block's **own** acceptance requires *"each line's vendor portion traceable for that vendor's A/P aging
   and 1099 totals — do not lump the whole $1,000 under one vendor."* A per-vendor **bill** flows natively into
   `accounting.bills` → A/P aging → 1099 per vendor. A single JE with vendor-tagged debit lines does **not**
   populate A/P aging the same way (JE lines are not bills), so it would *weaken* the very traceability the
   block demands.
2. It reuses the audited `bulkPostTransactionsAsBills` path — **no new GL math**, which the skill (§2) and the
   block both require.
3. The "single cash disbursement" invariant is preserved by the **split parent**: the one bank transaction is
   split, and each line's bill is settled from that same transaction — cash out = total, to the cent (enforced
   `:246-250`).
4. "Match to an existing bill on a line" (block option) already fits: a vendor line can target an existing
   open bill as a bill-payment instead of creating a new bill.

If the owner/CPA instead wants a literal single balanced JE (e.g. for a specific reporting reason), that is an
**additive** second posting mode — not a replacement — and a separate Tier-1 block. **Do not delete the
per-vendor-bill path** (§7 additive-only).

---

## 5. What is left before ANYONE enables it (all owner/GUARD-gated)

1. **GUARD Neon-branch proof** of the acceptance scenario: split a $1,000 txn into 3 lines / 3 different
   vendors / 3 categories → commit on a Neon branch with `BANK_TX_SPLIT_GL_POSTING_ENABLED` ON → assert (i)
   3 vendor bills, each attributed to its own vendor; (ii) each vendor's A/P + 1099 reflects only its portion;
   (iii) total cash out = $1,000 to the cent; (iv) re-commit is a no-op. **Coder does not run this on prod.**
2. **Owner ruling on §4** (per-vendor-bill — recommended — vs add a single-JE mode).
3. **"Split N ways by driver" helper** — verify present or build additively (currently UNVERIFIED / likely gap).
4. **Owner ceremony** to flip `BANK_TX_SPLIT_ENABLED` + `BANK_TX_SPLIT_GL_POSTING_ENABLED` per entity —
   **after** owner sign-off + Neon tie-out (skill §6: money-posting flags stay OFF until CPA + tie-out).

**Coder does none of 1–4 unilaterally.** This doc is the design + hold record; the flags stay OFF.

---

## 6. Hold confirmation

- No live posting wired in this PR. No flag flipped. No migration added.
- The GL assembly is already build-and-hold behind two default-OFF flags.
- Enable path is owner-only, gated on GUARD proof + CPA + Neon tie-out.
- Additive-only: the per-vendor-bill path is not to be deleted; any single-JE mode is a separate additive block.
