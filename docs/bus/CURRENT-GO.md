# CURRENT GO — IDLE WAKE · 2026-08-31 17:15Z (12:15 CDT) · all seats

**FULL DISPATCH:** `docs/bus/GO-IDLE-WAKE-2026-08-31T1715Z.md` — read it before you pop.
**LAW:** `NEVER-IDLE-SEAT-LAW-2026-08-31.md` · `LAW-ORCHESTRATION-NO-BOTTLENECK-2026-08-31.md`

Owner reported seats idle. Verified: CASCADE 70m · CC-1 62m · CURSOR 49m · DEVIN-A 38m ·
CODEX 30m · CC-3 17m — all with **non-empty queues**. Idle was not starvation. It was not popping.

| Seat | BLOCKING NOW | why it is the top item |
|------|--------------|------------------------|
| **CC-1** | **DEFECT A + DEFECT B root cause** | see below — money, silent, class-level |
| **CC-2** | **ESCROW: 172 of 175 drivers have no account** | 12 drivers already deducted $1,100 against nothing |
| **CURSOR** | **Flag the 57 unflagged future-dated JEs** | test-policy amortization posting as REAL money |
| **CASCADE** | **NAVY-SUBNAV-INVENTORY (178 routes, 3 done)** | mechanical, no Chrome, unblocked, zero excuse |
| **DEVIN-A** | **L-0004 completed_docs → settle, Live Chrome** | reproduces DEFECT B in the UI for CC-1 |
| **CODEX** | **Phase 7 bank txn → settlement match** | still zero, ever |
| **CC-3** | continue current lane | active |

## THE TWO DEFECTS — live Neon, USMCA, 17:14Z
Loads today, `bills` / `settlement_lines`:
```
L-0002  completed_docs_received   0 / 0   <- DEFECT A
L-0003  delivered_pending_docs    1 / 1   <- settled though NOT eligible
L-0004  completed_docs_received   1 / 0   <- DEFECT B
L-0010  completed_docs_received   1 / 1   <- correct
```
**DEFECT A — MINT-SKIP.** L-0002 reached the terminal state with **zero** driver_bills. It did not
fail loudly; it did not run. A driver worked a load and the system has no record it owes him.

**DEFECT B — SETTLE NON-DETERMINISM.** 1 of 3 loads at `completed_docs_received` produced a
settlement_line. A load at `delivered_pending_docs`, which is not settle-eligible, produced one.
Settle fires where it must not and skips where it must.

Blast-radius law: state N = every load that ever reached a settle-eligible state. Fix all of N.
Guard + selftest that fails on a planted skip. **No per-load remint before the predicate is named.**

## Other live numbers (same read)
```
FUTURE_JE_UNFLAGGED   57 of 62   <- CURSOR: flag is_sample_data=true, reverse-not-delete
AUG_JE_UNFLAGGED     236         <- month-end baseline, HOLDS, OWNER-ONLY, do not touch
ESCROW_BALANCES        3 / 175 drivers
```
All 7 loads created today carry `is_sample_data = true` — **G1 inheritance is working.** Hold it.

## Standing — no exceptions
NO VOIDS on `INV-2026-00049..00081` (owner: real transactions). · Nobody closes August but the
owner. · Only CC-2 writes `prod_verified`. · Never `trigger_deploy` — Cursor only, Rule 42. ·
USMCA only; TRANSP/TRK frozen. · Reverse, never erase.

## PENDING OWNER UPLOAD — do not act
Owner is uploading signed insurance documents and values. The EDSA file on hand is a **quote, not a
binder** ($271,280.41 combined; "coverage is not bound until confirmed in writing"), and it carries
three unresolved discrepancies: 14 vs 15 power units (a $37,400 gap), a schedule footer that misses
its own sum by $383,580, and $2,532.18 between the carrier quotes and the finance agreement.
**No insurance JE, policy row, prepaid asset or note-payable entry until the owner supplies signed values.**

**Idle = defect. Do not wait on a deploy or on another seat.**

## CURSOR CLOSEOUT — 2026-08-31 12:35 CT
- Future JE flag: **DONE** — `future_unflagged=0`, `future_sample=62`, `AUG_REAL=236` unchanged (Neon lucia).
- Queue refill: **N/A** — every QUEUE-* has ≥4 OPEN (CC-1:7 CC-2:5 CC-3:4 CASCADE:6 CODEX:4 DEVIN-A:5 CURSOR:4).
