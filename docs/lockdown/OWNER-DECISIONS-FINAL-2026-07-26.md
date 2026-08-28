# OWNER DECISIONS — FINAL (2026-07-26)

**Status:** LOCKED. Complete answered set. Agents must not re-ask these. No CPA gate — owner decided (`OPERATING-FACT-no-CPA-owner-decides`).  
**QBO write-back:** NEVER ON.  
**Posting:** ON in all 3 entities (TRANSP / USMCA / TRK) for testing.  
**Neon / merge mechanics:** **SUPERSEDED-BY OWNER LAW 2026-08-03** — every coder has FULL Neon access and merges on green. Historical “Devin is the merger” / “Jorge’s word to apply” lines below are **not** current operating method. See `.cursor/rules/00-operating-method-LAW.mdc`.

**E1 (tax) is the current withholding / 1099 ruling.** It supersedes `docs/LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md` BLOCK-17/24 bullets and any “OPEN COMPLIANCE QUESTION for Jorge/CPA.”

Only **F15** was open for wording; locked below as **hybrid**.

---

## A — Money

| ID | Decision |
|---|---|
| **A1** | Alert after **7 days** unmatched (single threshold). |
| **A2** | **B** — dedicated intercompany accounts per pair (already seeded on Neon, all 3 pairs). |
| **A3** | Fuel overage: **150 gal/swipe (~$900 today, moves with price)**; non-fuel = personal = auto-recover full, except repairs/authorized. |
| **A3b** | **Approve first, then recover.** |
| **A3c** | New **"Driver Fuel-Overage Receivable"** (not Cash Advance). |
| **A3d** | Escrow → if short → **"Driver Damage Loss"**. |
| **A4-D1** | **A** — one **"Fixed Asset – Trucks"**. |
| **A4-D2** | **A** — new **"Heavy Repair Expense"** account. |
| **A4-D3** | **C** — hybrid (shop invoice = bill; on-the-spot cash = expense). |
| **A4-D4** | Build the **FULL** fixed-asset + auto-depreciation register **NOW** (never defer). |
| **A4-D5** | **A** — require a Work Order. |
| **A4-D6** | **$7,000** capitalize-vs-expense threshold. |
| **A5** | **A** — agent prepares + applies escrow seed on Neon. |

## B — Invoicing (build the whole flow automatically, fully wired)

| ID | Decision |
|---|---|
| **B2a** | **A** — auto-create a Pro Forma Invoice at booking. |
| **B2b** | **A** — call it **"Pro Forma Invoice"**. |
| **B2c** | **A** — broker advance = liability, applied to pro forma, netted at POD — auto. |
| **B2d** | **Yes** — at POD auto-convert to Official Invoice + auto-send to factoring. |
| **B1** | **A** — manual **"Bill TONU"**, owner approves. |
| **B3** | **C** — block a line with no account; **"Uncategorized"** is the only fallback. |

## C — Settlements / Factoring

| ID | Decision |
|---|---|
| **C1** | **A** — escrow → pay → Damage Loss, automatic + fully wired. |
| **C2** | **E** — editable catalog with `may_draw_escrow`; seed abandonment + damage + safety fines; add/rename reasons. |
| **C2b** | **$2,500** escrow cap (code today $2,000 → change to $2,500). |
| **C3** | **B** — Faro is also a full vendor. |
| **C4** | **Later**. |
| **C5** | **CORRECTED:** the **COMPANY** absorbs factoring chargebacks, **NOT** the driver (company drivers, not owner-operators). |

## D — Maintenance / Safety

| ID | Decision |
|---|---|
| **D1** | **B** — split safety fines (DOT vs internal). |
| **D2** | **C** — inventory parts ≥ **$50**. |
| **D3** | **C** — one cancellation catalog with `applies_to`. |
| **D4** | **C** — build accessorial engine after the invoice exists; standard default amounts, editable per invoice, vary by customer (amounts TBD by builder to market standard). |

## E — Tax / Close

| ID | Decision |
|---|---|
| **E1** | **A** — no withholding from anyone (Mexico B1/B2 drivers, Mexican mechanics, all). W-8BEN on driver file AND in Legal. **No 1042-S/1099.** |
| **E2** | **C** — suggest + a person confirms. |
| **E2b** | **1** — auto-block dispatch on a positive drug/alcohol test. |
| **E3** | **A** — build state hire-doc storage now. |
| **E7** | **A** — Admin / Owner / Accountant can close. |
| **E8** | **A** — Jorge/Martin do year-end roll; system reports. |

## F — Scope

| ID | Decision |
|---|---|
| **F1** | **Build now** — lending analytics, Finance Hub. |
| **F2** | **Build now** — activity/audit dashboard. |
| **F3** | **Later** — calibration tracking. |
| **F4** | **Later** — document-control lifecycle. |
| **F5** | **Build now** — commodity → equipment on invoice; needs catalog/list + wizard. |
| **F6** | **Later** — commodity rates. |
| **F7** | **Build now** — 425C Exhibit C. |
| **F8** | **Build** — notifications. |
| **F9** | **A** — never delete money/audit/maintenance records; kill any such job. |
| **F10** | **Later** — IDVR. |
| **F11** | **Later** — key rotation. |
| **F12** | **A** — keep deduping, money-first. |
| **F13** | **A** — JE maker≠checker in the app now. |
| **F14** | **A** — resizable columns, all columns (standard). |
| **F15** | **Hybrid** — finance home = key numbers on top (cash, A/R, A/P, unreconciled, MTD revenue) + quick-action shortcuts below. |
| **F16** | **A** — factoring required-docs; blocked by default, owner can override at that moment. |

## G — Colors

| ID | Decision |
|---|---|
| **G1** | **A** — keep navy. |
| **G2** | **A** — keep navy. |

## H — Ops

| ID | Decision |
|---|---|
| **H1** | Post in **all entities** now (QBO write-back off). |
| **H2** | Any agent may prepare + apply Neon on Jorge’s word. **Devin merges PRs.** |

---

## Build implications (do not re-litigate)

1. **BANK-DOM-06** must use approve-then-recover (**A3b**), **Driver Fuel-Overage Receivable** (**A3c**), 150-gal/~$900 policy (**A3**).
2. Escrow cap code → **$2,500** (**C2b**).
3. Chargebacks → **company** expense/absorb (**C5**), never driver deduction for company drivers.
4. Fixed-asset register + auto-depreciation is **in-scope now** (**A4-D4**), $7k threshold (**A4-D6**).
5. Pro forma → official invoice → factoring is a **fully wired auto flow** (**B2\***).
6. Later items (**C4, F3, F4, F6, F10, F11**) need named tracker + future block id if deferred in a PR.

*Canonical copy also in repo: `docs/lockdown/OWNER-DECISIONS-FINAL-2026-07-26.md`*
