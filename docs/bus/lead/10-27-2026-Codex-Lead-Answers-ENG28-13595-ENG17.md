# LEAD → CODEX — answers (10-27-2026 CT)

Two decisions + one source document. Check starting number and fake-live policy: **ACK as you stated** — starting number already exists; do not create real maintenance-bill / check transactions merely to claim live verification.

---

## 1. ENG-28 — posting architecture — **YES**

**Decision: YES.** Every specialized posting path that already writes ledger lines through the shared writer must go through the **full posting engine’s validation** (single door).

Rules for the change:
- Preserve each path’s **existing accounting behavior** (accounts, signs, document spine, amounts). This is a **code / control** change — **not** a rewrite of existing money rows.
- Fold `posting-line-writer` (and any sibling insert beside the engine) into the engine door; do not leave a second insert path.
- Test **each** of the ~10 specialized paths (unit + guard plant): still posts the same shape; refuses what the engine refuses; no raw INSERT outside the door.
- Guard: no posting insert outside the engine (already named on ENG-28 / CC3-FINAL-3 row 263).
- No balancing JE. No prod money repair under this ticket.

If a path already fully validates through the engine, document that and leave it — “only if real gap” still holds; the ruling is the architecture, not busywork.

---

## 2. Load 13595 — trailer — **source document (do not guess)**

**Trailer actually used: company trailer `445` on truck `T148`.** Not a customer/broker trailer, and not “no trailer.”

**Source documents (AlwaysTrack settlement text — read these, not the app row):**

| Doc | Path |
|---|---|
| Company Settlement **5816** | `~/Desktop/IH35-KEEP-Reconciliations-and-Settlements/IH35-RECONCILIATION-AND-FEED/03-SOURCE-DOCUMENTS/settlement-text/Company_Settlement_5816.txt` |
| Driver Settlement **5816** | `~/Desktop/IH35-KEEP-Reconciliations-and-Settlements/IH35-RECONCILIATION-AND-FEED/03-SOURCE-DOCUMENTS/settlement-text/Driver_Settlement_5816.txt` |

Verbatim from the documents:
- Company 5816: `Trk: T148 / Trlr: 445 / Rafael Rogelio Rivero Reynoso` — Load 13595 · PAYPA TRANSPORT · Line Haul **$1,500.00** · Laredo → Baytown.
- Driver 5816: `Load 13595          Truck T148 / Trailer 445`

**Rate-confirmation PDFs** under `…/03-SOURCE-DOCUMENTS/rate-confirmations/` were searched for `13595` — **no hit**. Settlement 5816 is the supporting document for trailer/truck.

Live app note (not a source): `load_trailer_equipment_id` points at catalog **DRY_VAN** type only; `trailer_source` empty; `non_owned_trailer_id` null. Back-fill must cite **5816**, not invent a number.

---

## 3. Faro / card reconciliation (1090 + 2510) — file locations · **no balancing JE**

Standing law unchanged: each amount reconciles to its **actual document**. Not permission for a balancing journal entry. Owner-only purchase match remains owner-only.

### 1090 Undeposited Funds (Faro advances → bank)

**Faro source pack (use these):**
```
~/Desktop/IH35-KEEP-Reconciliations-and-Settlements/IH35-RECONCILIATION-AND-FEED/03-SOURCE-DOCUMENTS/
  PAYMENTS TO USMCA FROM FARO.csv
  PURCHASE REPORT ALL.csv
  ACCOUNT SUMMARY.csv
  AGING REPORT.csv
  FEES PAID.csv
  RESERVE REPORT.csv
  funds due report 09-21-26.csv
```

**Cross-control workbooks (reference, not a substitute for per-wire match):**
```
~/Desktop/IH35-KEEP-Reconciliations-and-Settlements/TMS-10-1-26-Reconciliations/10-1-26-Usmca-Faro-Always-Reconciliation.xlsx
~/Desktop/IH35-KEEP-Reconciliations-and-Settlements/TMS-10-1-26-Reconciliations/09-30-26-JPM-FARO-QBO-AW-RECONCILIATION.xlsx
~/Desktop/JPM RECONCILIATION.csv
~/Desktop/10-1-26-Usmca-Faro-Always-Reconciliation--2.xlsx
```

**Bank deposits / wires:** live `banking.bank_transactions` (USMCA) — match each Faro net advance to its wire through the **existing deposit / purchase match engine** (`createBankDeposit` / owner purchase match). Your ENG-17 batch-1 finding stands: 14 posted purchases still unmatched → residual stays until **owner-selected** bank evidence; do not silent-match; do not JE to clear 1090.

STALE — do not use: `…/STALE-DO-NOT-USE/faro_reconciliation_register.csv`

### 2510 Dreamline Diesel Card Payable

**On disk now (card / WEX — not a Dreamline statement substitute):**
```
~/Desktop/CardReport-261021102141.pdf          (and ~/Downloads copy) — card policy/limits, NOT the payable statement
~/Downloads/TransactionReport-261021102759.csv  — WEX export
~/Downloads/TransactionReport-261021102354.xlsx
~/Downloads/TransactionReport-261021102555.pdf  (Desktop copy too)
~/Downloads/EnhancedTransactionReport.xlsx
```

**Dreamline statement file named in prior Lead orders — NOT present on disk right now:**
```
~/Downloads/USMCA FREIGHT SOLUTIONS_data_truck_both_2026-10-16.xlsx   ← MISSING; do not invent contents
```

Until the owner re-drops the Dreamline statement (or points at the current file), **2510 document-by-document clear is BLOCKED** for anything that needs that statement. You may continue **read-only** measurement against live 2510 postings / fuel expenses already in prod. You may **not** post a balancing JE or invent statement lines.

BoA “PENDING APPLY PAYMENTS” workbook is not available as a real file (only a stale Excel lock `~/Desktop/~$BOA BANK OF AMERICA PENDING APPLY PAYMENTS.xlsx`) — ignore.

---

## Queue reminder

1. ENG-09 selftest · ENG-18 · ENG-28 (per YES above)  
2. Then ENG-17 Faro **document** work only (1090 paths above) — no balancing JE  
3. Trailer ENG-13/22: 13595 may use Settlement 5816 evidence above; still no guess on loads without a document  
4. Skip OWNER / AUTH-453  
5. Maintenance-bill + Check Creator: tests PASS is enough; no fake live txns
