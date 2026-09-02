# QBO Transportation file = USMCA books · Faro + AlwaysTrack match (owner 2026-08-30)

**ANSWERED = CLOSED.** Owner chat 2026-08-30. **REV D amendment** same day: `docs/lockdown/CODERS-2026-08-30/00-PASTE-NOW-GO-AMENDMENT.txt`.

The TMS was not ready when USMCA started operating. **Transportation stopped.** In QuickBooks, the **Transportation company file was renamed to USMCA.** Live QBO company: **USMCA Freight Solutions, Inc.** One file = the USMCA books.

Neon still keys the clone on TMS opco **TRANSP**. That is clone keying, not a second operating company.

**P1 QBO-MIRROR-STALE:** `mdata.qbo_ar_invoices` last synced ~**2026-08-14** (max 3-digit **013**). **Live QBO runs 001–036.** No seat may cite the mirror as proof of **absence** until `last_seen_at` is inside 24 hours. Absence in the mirror is not absence in QuickBooks.

AlwaysTrack still has one company: **IH35 Transportation, LLC.** Entity for money is **which Faro schedule bought the invoice**, then QBO/AT remainder via the **crosswalk**.

## How to reconcile

1. Use `docs/lockdown/CODERS-2026-08-30/CC-1/CC-1-FARO-QBO-AT-CROSSWALK.csv`. `link_basis = NONE` is not a fact — do not post.
2. From QBO doc **014**, line text carries AT load (`LOAD NUMBER - 019 - 13526`). Documentary. Never join on AT **Total** (QP-net); use **Charges**.
3. Outage ~08/10: 3-digit QBO docs, Work Order often blank. **007 ITS** has **no AT load** and that is correct. Grade QBO **$250** vs Faro **$350** / PO `68747`.
4. **HOLD Faro 016 MPH** until owner: AT 13524 **$4,200** vs Faro **$3,800**, no QBO 016 (jumps 015→017).
5. One TMS invoice per load. Do not import QBO doubles (019+13526 …) or triple **006**. QBO A/R overstated **$24,800** — owner/Martin cleanup **in QBO** (void/credit memo). No TMS→QBO write-back.
6. Named leftovers: **009** FLS $525 and **010** SCM $4,000 unfactored; **026** IM Specialized direct-pay closed.

## Does not change

- No TMS→QBO write-back. No new USMCA QBO realm.
- Do not copy `qbo_customer_id` onto USMCA TMS rows.
- Intercompany cash that moved: **$7,241**.

Companion: `docs/lockdown/OWNER-RULING-USMCA-FIRST-FULL-READY-2026-08-16.md`.
