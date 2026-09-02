# PASTE ALL SEATS — GO-0023 · URGENT-6 TRUE REMAINING (live-read 2026-08-28 18:50 CT)

**THIS IS NOW.** Supersedes GO-0022 “drain 500” and Codex DSP-F7127 vertical as NOW.  
Source: `docs/module-completion/*.json` on `origin/main` + prod healthz **`4e5db76`** (132 behind main). L6 `21dd6a4f` merged, **not deployed**.

121 Urgent-6 items. **88 done. 33 not.** Banking/vendors `complete:true` with `prod_verified:false` is **fake-green**. Zero `live_verified_sha` on all six manifests. Do not cite banking/vendors complete until the 25 are earned live.

**Nobody `trigger_deploy`.** Deploy rides Rule 42. PROG-01 `202613270000` does **not** start. KEEP TEST. USMCA only. FAST-MERGE after local gate. Skip #15546. Never restamp U14 exclusive table.

RLS: a 0 without `BEGIN; SET LOCAL app.bypass_rls='lucia';` + discriminator table with known non-zero = “could not see”, never “nothing.”

## THE 8 GENUINELY OPEN (do these first)

| Seat | ID | NOW |
|------|-----|-----|
| **CC-1** | `ACCT-SURF-02` | Expenses — DoD A–E + VERIFY 1–8 with **live rows** |
| **CC-1** | `ACCT-SURF-04` | Receive Payment — DoD A–E + VERIFY 1–8 with **live rows** |
| **CC-2** | `ACCT-R-04` | G4 deploy smoke: fixed unit env + test-owner excluded from prod listings |
| **Codex** | `DISP-S19` | `/dispatch/layovers/driver/:driverId` renders + entity-scoped + honest empty |
| **Codex** | `DISP-S26` | `/dispatch/planner` same bar |
| **Codex** | `DISP-S34` | `/dispatch/settings` same bar |
| **Codex** | `DISP-S35` | `/dispatch/settlements` same bar |
| **Codex** | `DISP-S36` | `/dispatch/trip-pairing` same bar |

Codex: **these five are the lane.** Not another DSP-F7127 scope series.

## THE 25 UNVERIFIED (after the 8, or parallel if disjoint)

| Seat | Work |
|------|------|
| **CC-3** | Banking: **prod-verify** 18 items with `prod_verified:false`. Live rows, entity scope, **CURRENT deployed SHA `4e5db76`**. Flipping the flag without a live read = defect. |
| **Devin** | Vendors: same for **all 7** items. `mdata.vendors` is CANONICAL. |

No module reports complete until every item has earned `prod_verified:true`.

## THEN, AND ONLY THEN

Stamp `live_verified_at` / `live_verified_sha` on all 121 once deploy **≥ `21dd6a4f`** is serving. Until then stamping is impossible.

## Other seats

| Seat | NOW |
|------|-----|
| **Cascade** | Unique FINDING only if still true on **live `4e5db76`**. Do not restamp U14. Do not flip `prod_verified` from code-read. |
| **Cursor** | Lead. Census. Ping idle. FAST-MERGE this bus. Deploy **only** 5–10 gate. Do not author `202613270000`. |

## ACK (OUTBOX line 1) then **work the IDs** — ACK is not done

| Seat | ACK |
|------|-----|
| CC-1 | `CC-1 \| ACK \| GO-0023 \| NOW=ACCT-SURF-02-then-04 \| SHA=4e5db76 \| GO` |
| CC-2 | `CC-2 \| ACK \| GO-0023 \| NOW=ACCT-R-04 \| SHA=4e5db76 \| GO` |
| CC-3 | `CC-3 \| ACK \| GO-0023 \| NOW=banking-18-prod-verify \| SHA=4e5db76 \| GO` |
| Codex | `CODEX \| ACK \| GO-0023 \| NOW=DISP-S19-S26-S34-S35-S36 \| SHA=4e5db76 \| GO` |
| Devin | `DEVIN \| ACK \| GO-0023 \| NOW=vendors-7-prod-verify \| SHA=4e5db76 \| GO` |
| Cascade | `CASCADE \| ACK \| GO-0023 \| NOW=unique-FINDING-on-live-SHA \| SHA=4e5db76 \| GO` |
| Cursor | `CURSOR \| ACK \| GO-0023 \| NOW=lead-u6-true-remaining \| SHA=4e5db76 \| GO` |
