# 5814: no variance (order compared unlike figures). Short-pays: contradicts a CLOSED decision — not posting — CC-1 — 2026-09-28 12:30 AM CT (05:30Z).
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-28-07.md` (WORM).

CC-1 | 5814 variance | CLOSED — NO FIX NEEDED. `gross_pay=2002.65` is CORRECT: it's the PDF's Salary
line ($1,902.65 = 945.10+957.55 loaded/empty miles, verified against both settlement_lines and the
signed PDF) PLUS the PDF's separately-itemized Additional Pay ($100.00 = 4×$25 tarp Enlonada/
Desenlonada). `net_pay=1992.65` matches the PDF's TOTAL DUE to the cent. The order compared the app's
TOTAL gross against the PDF's Salary SUBTOTAL — not a defect, a like-for-unlike comparison. Verified
line-by-line against `driver_finance.settlement_lines` (earnings + extra_pay rows) and the actual PDF
text. No write needed.

CC-1 | 3 short-pays ($3,750 → 4970) | NOT POSTING — contradicts a CLOSED decision and TMS data doesn't
support it. Identified the 3 invoices live:
```
inv 014 CORE LOGISTICS BROKERAGE   -> 13521  total 3,500.00  paid(TMS) 3,250.00  open 250.00
inv 015 DLS Dardini Logistics Svcs -> 13523  total 3,600.00  paid(TMS) 0.00      open 3,600.00
inv 018 DARDINI LLC                -> 13529  total 3,900.00  paid(TMS) 0.00      open 3,900.00
```
**inv 014/13521 is explicitly CLOSED in `~/Desktop/00-CLOSED-ASKED-AND-ANSWERED-NEVER-REOPEN.md`:**
*"One partial — invoice 14 / load 13521, open 250.00 — unknown until Core Logistics remits, PO
31496-65096. A gap is not a reason — no document means fault=unknown, account **4960**."* That is a
different account (4960, not 4970) and an explicit "unknown, do not force a close" ruling, not a
confirmed short-pay. Overriding it needs an owner ruling, not my judgment call.

**inv 015/13523 and inv 018/13529 show `amount_paid_cents = 0` in the TMS** — not partially paid at
all. The "paid 2,600.00" / "paid 1,400.00" figures in the order must be Faro-side collections not yet
applied/synced to these TMS invoices. Posting a write-off assuming a payment the TMS has no record of
would misstate the invoice's real open balance. Also: the intended posting mechanism itself is
unclear — `accounting.credit_memos` (the obvious candidate) is explicitly **"NO GL posting — marks
QBO-parity data only"** (credit-memos.routes.ts:13-14) and its reason enum has no
`customer_short_pay_writeoff` value (closest is `shortage`). A real A/R write-off needs an actual JE
(Dr 4970 / Cr A/R), which isn't this route's job.

Needs, before I touch any of these three: (1) an owner ruling on whether inv 014 is now closed as a
real short-pay (superseding the 4960/"unknown" ruling) or stays open, (2) Faro-side proof that 015/018
were actually collected short before I record a payment the TMS never saw, (3) the actual JE-posting
mechanism for an A/R writeoff to 4970 (not the QBO-parity-only credit memo route).

## Still open, unblocked
A/P adoption remains blocked on the GL-flag conflict (see prior NOW-CC-1 archive) — awaiting a
coordination decision. Role-binding repoints (172 dup account numbers) next.

CC-1 | 05:30Z | Moving to role-binding repoints while both A/P and short-pays await decisions.
