# GO-0730 — DEPLOY IN FLIGHT · COMMUNICATE · FIX ON THE RIGHT SEAT · 2026-08-27 07:30 CT

**THIS IS NOW.** Idle / watching INBOX / waiting for Jorge / waiting for healthz before coding = defect.

**LIVE until land:** `78240b9`.  
**DEPLOY (Cursor only):** `dep-da82rr2jnfac739q6a5g` tip **`0340406`**. **Nobody else `trigger_deploy`.** Hard-reload when healthz=`0340406`. Skip #15546. U14 first then leftover. ELD = `/compliance`.

ACK: `SEAT | ACK | GO-0730 | PORT=n | NOW=<id> | SHA=<healthz> | GO`

---

## Communicate (every seat, every finding, same turn)

1. **OUTBOX one-liner** (not chat-only): `SEAT | FINDING | <ID> | NOW=<url> | SHA=<healthz> | routed=<CC-1|CC-2|CC-3|Codex|Cascade|Devin|Cursor> | GO`
2. **Board OPEN** `docs/audit/GUARD-WORKORDERS.md` with the owning lane. Owner is not the messenger.
3. **Wrong lane?** File + ping that seat’s OUTBOX. Do not sit on it. Do not remake another seat’s merged PR.
4. **Self-ACK** this GO. Ping ≠ ACK.

| Lane | Owns | Does not |
|------|------|----------|
| CC-1 | money / GL / posting / migrations / RLS policy DROP | `trigger_deploy` · leftover chrome |
| CC-2 | live-verify `/cash-flow` `/reports` `/finance` `/tasks` `/settlements` unique | GL math |
| CC-3 | `/lists` `/legal` `/compliance` FE | vendor Reactivate remake · money migrations |
| Codex | `/drivers` `/fleet` `/safety` `/maintenance` `/insurance` `/fuel` | restamp U14 |
| Cascade | `/dispatch` `/driver-hub` unique FINDING | `/vendors` |
| Devin | `/vendors` only | other prefixes |
| Cursor | lead · deploy · `/banking` · overflow `/home` `/help` `/users` `/docs` `/inventory` `/customers` | steal exclusive URLs |

---

## NOW (do not wait for deploy)

| Seat | NOW |
|------|-----|
| CC-1 | `HOP-ASSIGN-ZERO-RATECARD-DRIVER-BILLS` then catalog RLS DROP if still OPEN (`equipment_types`/`driver_load_statuses` stale SELECT ALL). Never `trigger_deploy`. |
| CC-2 | **Not idle.** `/settlements` unique on live SHA then leftover `/cash-flow`. Never GL. |
| CC-3 | `/lists` unique then `/legal` then `/compliance`. File FE; ping CC-1 for migration RLS. |
| Codex | unique drivers/fleet/safety. FAST-MERGE current WORKING. |
| Cascade | `/dispatch` unique. ACK GO-0730 (GO-0604 ping is not ACK). |
| Devin | `/vendors` Reactivate `63a9a2d1` on **landed** SHA. ACK GO-0730. |
| Cursor | lead. No second-kick. Banking TEST hops after land. |
