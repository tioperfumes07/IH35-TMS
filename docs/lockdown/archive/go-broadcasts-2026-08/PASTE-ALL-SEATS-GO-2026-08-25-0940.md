# PASTE ALL SEATS — GO 2026-08-25 09:40 CT

Owner: scenarios live on `/program` USMCA · SHA **`a80afec`**. Hard-reload. **Nobody `trigger_deploy`.** U14 never restamp.

**Live Program (USMCA, 9:40 AM CT) — 28 cards = 9 hops + 19 scenarios.**
We did **not** invent a 15th plan. The 4 **new** Program cards this campaign added are the complicated-battery keys: `breakdown_relay` · `trailer_swap` · `roadside_ap` · `parts_receive`. The other 15 scenarios + 9 hops were already on the tracker.

**Complete (20):** hops 1,3–8 · customer · driver_onboarding · coa · advance · escrow · ap · fuel · legal · factoring · banking · breakdown_relay · trailer_swap · parts_receive

**Merged / not Complete (8) — THIS is remaining work:**
1. `hop.assign` — driver bill vs customer rate probe
2. `hop.bank` — Program probe still `matched_invoice_id` **0**; Neon has recon_matches + `matched_transfer_id`. Widen probe **or** stamp invoice match. Do not remake hop 9 Chrome theater.
3. `scenario.settlement`
4. `scenario.deductions`
5. `scenario.maintenance`
6. `scenario.accident` — do **not** fake an accident
7. `scenario.insurance` — only with a real claim
8. `scenario.roadside_ap` — TMS bill on WO `850e2cc4` exists; JE chain does not satisfy the live probe

**OPEN findings (not all scenario-fix PRs done):**
- `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` — invoice still `INV-2026-00044` not `L-20260824-0007`
- `CASHFLOW-PROFORMA-PROJECTED-LABELED`
- `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` `57cabbab` status=posted / posting_status=**unposted**
- `SETL-EVIDENCE-UPLOAD-SILENT-DROP`
- PCMILER/geofence owner-gated (`/geocoding/search` enabled:false)

Reuse load `065538c8-…` (`L-20260824-0007`). Do **not** remake Complete cards / parts `45f36791` / BILL-2026-00015.

| Seat | Port | NOW | Do not |
|------|------|-----|--------|
| **CC-1** | 9223 | Serial: invoice#=load# · cash-flow Projected labels · JE `57cabbab` · `hop.bank` probe honesty · `scenario.roadside_ap` JE · `LV-PAY-SETTLE-NOPOST` / `scenario.settlement` | `/425c` · remake Complete hops · remake advances · `trigger_deploy` |
| **CC-2** | 9224 | After CC-1 labels: prove `/cash-flow` Projected/Pre-invoice. Unique leftover 500/dead. Print letters on existing TESTs | remake hop 9 · Close |
| **CC-3** | 9225 | `scenario.maintenance` unique leftover (card Merged). Legal is Complete — do not remake. WO letter print if still SPA | remake parts `45f36791` · CLASS-F5973 |
| **Codex** | 9226 | `hop.assign` driver-bill/rate. Settlement money is **CC-1**. Deductions after. Accident/insurance **only if real**. Trailer_swap + fuel Complete | remake breakdown · steal settlement · `trigger_deploy` · U14 restamp |
| **Cascade** | audit | Re-walk `/program` USMCA. FINDING if Complete card is false-green | product PR · U14 restamp |
| **Devin-A** | audit | hop.book + customer (already Complete). FINDING if Book Load silent | PARKED · U14 restamp |
| **Cursor** | 9222 | Lead/deploy. PCMILER owner-gated. Unique leftover. Do not steal money | second-kick · remake Complete |

OUTBOX: `SEAT | ACK | GO-0940 | PORT=n | SHA=a80afec | KEY=<card> | NOW=<Complete\|Merged> | FINDING=<id-or-none> | GO`
