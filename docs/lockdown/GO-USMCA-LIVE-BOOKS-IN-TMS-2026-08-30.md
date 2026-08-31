# GO — USMCA LIVE BOOKS IN THE TMS (owner 2026-08-30)

**STOP — READ AMENDMENT BEFORE ANY CREATE.**  
`docs/lockdown/CODERS-2026-08-30/00-PASTE-NOW-GO-AMENDMENT.txt`

Do **not** “then the Faro 33.” That would post invoices with no source document.

- Create **all 33** Faro invoices. **HOLD 016 is VOID.** Recreate 016 as **$4,200 invoice → $400 CM `unknown_pending_backup` → factor net $3,800**. Expected face **$95,075**. $91,275 is mid-fix, not the target.
- One load, one TMS invoice: 3-digit QBO doc only (019 not 13526, …). Do not import QBO duplicates. **006** = one BV $2,600 “Load Number - 006” only.
- **Do not** cite `mdata.qbo_ar_invoices` as proof of **absence** (mirror last synced ~08/14; live QBO runs to **036**). Use the crosswalk: `docs/lockdown/CODERS-2026-08-30/CC-1/CC-1-FARO-QBO-AT-CROSSWALK.csv`. Never match on AT **Total** (net of QP). Use **Charges**.

**THIS IS NOW.** Owner: put **invoices, settlements, and factoring** on **USMCA in the TMS** and test with **real August data**.

Law: `docs/lockdown/QBO-TRANSP-FILE-IS-USMCA-BOOKS-MATCH-LAW-2026-08-30.md`  
Specimen: `docs/lockdown/Coders-Faro/CC-1/CC-1-HUMAN-SEQUENCE-REPLAY.txt`  
Pack: `docs/lockdown/CODERS-2026-08-30/` + `docs/lockdown/Coders-Faro/`

## Match (every seat)

1. Crosswalk first (`link_basis` — NONE is not a fact).
2. Faro purchased ↔ AlwaysTrack **PO / W.O.** when AT exists. Line text `LOAD NUMBER - 0xx - 13nnn` from doc **014** on is documentary.
3. Outage window (~08/10): QBO 3-digit docs **001–036** in **live QuickBooks** (USMCA Freight Solutions, Inc.). Mirror is stale — not an absence proof.
4. Remainder named: QBO **009** FLS $525 and **010** SCM $4,000 unfactored (owner). **026** IM Specialized direct-pay **closed**.

No TMS→QBO write-back. No silent SQL. **Through the app**, date order. `is_sample_data` **FALSE**. USMCA opco only. Skip **#15546** **#16895**. Never recertify U14. Never `trigger_deploy` except Cursor.

## Seat NOW

| Seat | NOW |
|------|------|
| **CC-1** | **Amendment first.** L13512 specimen. Then Faro **32**, skip **016**. One invoice per load per crosswalk. Settlements USMCA only. Factoring. |
| **CC-2** | Grade. 007 = QBO $250 vs Faro $350. **016** = P0 owner hold, not a CC-1 miss. Standing-by = defect. |
| **CC-3** | Unique leftover FE. Not books. Never deploy. |
| **Codex** | ITEM 2 only. No money. |
| **Cascade** | Unique FINDING. Do not recertify. |
| **Cursor** | Lead. Deploy. **1296.** Guard `one-load-one-open-invoice`. P1: stale QBO mirror is not absence. |

ACK: `SEAT | ACK | USMCA-LIVE-BOOKS | NOW=<row> | GO`
