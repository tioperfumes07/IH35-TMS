# Financial / Accounting — Owner Unblock Packet

**Purpose.** The accounting program is not blocked on more code — it is blocked on a short chain of
owner/CPA actions that only Jorge can perform (prod DB access, CPA sign-off, flag flips). This packet
lists those exact steps so the whole downstream can be unblocked in one sitting. Everything else is
built-and-held behind default-OFF flags, ready to flip the moment each gate clears.

Architecture context (locked): PARALLEL double-books; QBO is system-of-record through 12/31/2025;
CLONE-ONCE + RECONCILE-ONLY; **NO write-back**; all money-posting flags **OFF** until CPA + tie-out.
See `docs/specs/ACCOUNTING-ARCHITECTURE.md` and `docs/lockdown/00_LOCKED_DECISIONS.md`.

---

## The critical path (3 gates)

```
GATE 1  Supervised Neon/QBO pull ──▶  GATE 2  CPA sign-off ──▶  GATE 3  Per-entity flag flips ──▶  LIVE
(opening TB + AR/AP aging)            (opening JE + rules)       (once tie-out proves TMS==QBO)
```

Gate 1 is the keystone — reconciliation, the opening JE, and every posting flag depend on the pulled data.

---

## GATE 1 — Supervised Neon / QBO pull (only Jorge; §1.5 prod access)

**Goal:** land QBO's 12/31/2025 closing position into the TMS clone tables so it becomes the opening
position, then keep AR/AP current for reconciliation.

**What to pull (source = QBO, as of 2026-01-01 cutover / 12/31/2025 close):**
1. **Trial Balance** as of 12/31/2025 — every account, signed actual balance (not natural-side).
2. **A/R Aging Detail** — open customer invoices (this is the AR opening + the reconciliation baseline).
3. **A/P Aging Detail** — open vendor bills (AP opening + reconciliation baseline).
4. **Chart of Accounts** — confirm the clone matches (parity already strong; verify deactivated accts).

**How (safe, per §1.5 / the db:migrate-hits-prod landmine):**
- The QBO Reports client already exists and is reused: `apps/backend/src/integrations/qbo/qbo-client.ts`
  + `qbo-report-parser.ts` (IMPORT-0). No new QBO auth path.
- The importer is IMPORT-2/3/4 (opening JE + signed-actual), **built-and-held behind IMPORT kill-switches**
  (default OFF). Jorge runs the pull under supervision; the coder does not touch prod.
- Target clone tables (schema already merged): `accounting.invoices` / `accounting.bills` /
  `accounting.payments` carry `source='qbo_clone'` (MD-3), and `mdata.customers`/`mdata.vendors` carry
  `source_system='qbo'` + `source='qbo_clone'` (MD-1/2). Pullers stamp origin + void-gone-from-QBO.
- **Verify `current_database()` / `inet_server_addr()` before any connection. Never reuse a prod string.**

**Definition of done for Gate 1:** TMS clone shows the same AR total, AP total, and TB as QBO at 12/31/2025
(leaf-level, signed, void-excluded, UNION tie-out per the QBO-import CPA corrections).

---

## GATE 2 — CPA sign-off (design done; needs the CPA's name on it)

Confirm the already-locked decisions and the opening entry. Nothing here is new design — it's ratification.

**Opening JE (IMPORT-2/3/4):**
- [ ] **BS-only opening** at 12/31/2025; **signed-actual** balances (not natural-side).
- [ ] TRK gets **full equity**; **OBE → Retained Earnings** as a temporary clearing account (a permanent
      OBE balance is a defect — must net ≈ 0).
- [ ] Multicurrency: home-currency + FX accounts handled.

**Locked posting rules to ratify (from the CPA packet):**
- [ ] **Factoring = secured borrowing / recourse** (Factoring Advance liability / Factoring Reserves
      short-term asset / Factoring Recoursed Invoices). Not a sale.
- [ ] **Driver escrow = LIABILITY** (held-in-trust, returned 60–90d post-separation net of deductions).
- [ ] **Cash-basis** mirrored from QBO for TRANSP (books + MOR); AP is the rare accrual exception.
- [ ] Drivers = Mexican B1, W-8BEN yearly; 5% net-floor + override; "Cost of Labor–Mexico Drivers".
- [ ] Revenue recognized at **canonical load delivery** (TMS ACCRUAL; final active delivery stop completion/actual departure); POD/invoice = billing/factoring readiness only; QBO cash-basis mirroring unchanged; "Sales of Service" / Line Haul (+ Fuel Surcharge / Accessorial) children.
- [ ] A/R = QBO-45, A/P = QBO-47 (QBO natives off).

**Definition of done for Gate 2:** CPA initials each box; the opening JE is generated (flag still OFF) and
its trial balance ties to Gate 1's pulled TB.

---

## GATE 3 — Per-entity flag flips (only Jorge; one at a time, tie-out-gated)

Each flag defaults OFF and is flipped **per entity** only after tie-out proof. Order = safest first.

| Order | Flag | Effect | Flip precondition |
|---|---|---|---|
| 1 | (reconciliation read) `TMS_QBO_RECON_ENABLED` | turns on the read-only reconciliation module (no posting) | Gate 1 done |
| 2 | `INVOICE_AR_GL_POSTING_ENABLED` | invoice → AR GL post | Gate 2 + AR tie-out |
| 3 | `BILL_GL_POSTING_ENABLED` | bill → AP GL post | Gate 2 + AP tie-out |
| 4 | `BANK_FEED_GL_POSTING_ENABLED` | bank feed → GL | Gates 2–3 stable |
| 5 | `AMORTIZATION_GL_POSTING_ENABLED` | prepaid/deprec schedules → GL | Gate 2 |
| 6 | factoring posters (R1/R4) | factoring → GL | CPA + factoring reconciliation |

**How to flip:** admin-UI per-entity override (`lib.feature_flag_overrides`) — never a global default. The
endpoint returns a policy error while OFF (no silent behavior). Money never moves without a per-action OK (§1.6).

**Definition of done:** each flag ON for TRANSP only (USMCA/TRK stay OFF until their own tie-out), with the
reconciliation module green (zero unexplained exceptions) for a full day after each flip.

---

## What is built-and-held right now, waiting on each gate

| Item | State | Waiting on |
|---|---|---|
| IMPORT-0 QBO Reports client + parsers | built | — (reused by pull + RECON-01) |
| IMPORT-P0 / P0b JE + entity push kill-switches | built, OFF | — (safety; stays OFF) |
| MD-1/2/3 clone-origin schema + pullers | merged | Gate 1 (to populate) |
| IMPORT-2/3/4 opening JE (signed-actual) | held behind kill-switch | Gates 1 + 2 |
| **RECON-01** per-txn categorization-diff engine | **to build (build-and-hold)** | Gate 1 (live register) |
| Posting engines (invoice/bill/bank/amort/factoring) | design + flag-OFF | Gates 2 + 3 |

---

## Recommended sequence

1. Finish RATECON-1 (dispatch; in flight — doesn't touch accounting bandwidth).
2. Build **RECON-01** build-and-hold (the correctness spine; ~80% needs no live data).
3. Jorge runs **Gate 1** (supervised pull) → **Gate 2** (CPA) → **Gate 3** (flips), using this packet.

Owner: Jorge. Coder role: build-and-hold + prepare each gate; never cross §1.4/§1.5/§1.6.
