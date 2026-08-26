# PASTE ALL SEATS — GO 2026-08-25 13:50 CT

**Idle = defect.** Hard-reload **USMCA**. Live at kick **`db5bd15`**. Cursor kicked API deploy **`dep-da6u8615efls73cul3fg`** (in flight) for undeployed tip — **nobody else `trigger_deploy`.** When `healthz/shallow` moves, hard-reload. U14 never restamp. PCMILER/geofence owner-gated.

**Not a 15th plan.** Same GO-1242 25-item lists. This paste is the **remaining NOW** after INBOX/OUTBOX audit. `git pull --ff-only origin main` → work **your** leftover numbers. Grep-verify every board id on `origin/main` before building.

Reuse load `065538c8-…` (`L-20260824-0007`), T-LIVE `1a3c98da-…`, WO `850e2cc4-…`. Do **not** remake Complete cards / Close / `/425c` / BILL-2026-00015 / parts `45f36791`.

**ACK status (origin/main this hour):**
- CC-2 ACK GO-1242 26–50 honest partial (#15823). Cash-flow labels still **blocked on CC-1 #1–2**.
- CC-3 ACK GO-1242 51–63 (#15825) + 64/66 status (#15835). WO complete still waits **CC-1 #6**.
- Cursor ACK 151–155 (#15832).
- **CC-1: NO ACK.** Still sitting in Cursor lead tree. Money clone required.
- **Codex: NO GO-1242 ACK** (shipping other FE; still must ACK + hop.assign prove).
- **Cascade OUTBOX stale 2026-08-16.** **Devin / Devin-A: GO ping only, no ACK.** Walk `/program` now.

---

## Remaining that closes Program scenarios

These cards stay Merged until **CC-1** ships money. Other seats hunt unique leftover in parallel; they do not steal CC-1.

| Scenario / hop | Owner | Blocker |
|----------------|-------|---------|
| invoice# = load# (`INV-2026-00044` vs `L-20260824-0007`) | CC-1 #1 | `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` still `nextInvoiceDisplayId` in `from-load.ts` |
| `/cash-flow` Projected / Pre-invoice | CC-1 #2 then CC-2 #26 | `CASHFLOW-PROFORMA-PROJECTED-LABELED` |
| expense JE `57cabbab` | CC-1 #3 | `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` |
| `hop.bank` honesty | CC-1 #4 | probe vs Neon |
| `scenario.roadside_ap` TMS-native JE | CC-1 #5 | QBO clones do not count |
| `scenario.maintenance` posted Bill+JE | CC-1 #6 | `WO-AUTO-BILL-NEVER-POSTS-GL-JE` — CC-3 must not close WO `850e2cc4` until this |
| `scenario.settlement` pay-run JE | CC-1 #7 | `LV-PAY-SETTLE-NOPOST` |
| `hop.assign` rate-card driver bills | CC-1 #8 | `HOP-ASSIGN-ZERO-RATECARD-DRIVER-BILLS` — Codex proves UI only |
| Print invoice/bill/expense letters | CC-1 #9 | wrapPdfDocument |
| Official invoice → vendor bill pay | CC-1 #10 | factoring only on official invoice |

Grep-verify before rebuild: `SETL-EVIDENCE-UPLOAD-SILENT-DROP` may already be #15829 — do not remake if main closed it.

---

## CC-1 · 9223 · ACK GO-1350 then items 1–25 serial

**NOW = #1.** Money clone: `.claude/worktrees/cc1-money-lane` (or any clone on `main`). **Not** `IH35-TMS-clean`. Never `/425c`. Never `trigger_deploy`.

Ship #1 then #2 then #3 without waiting. After #1–2 merge, CC-2 re-walks cash-flow.

---

## CC-2 · 9224 · leftover 29, 40, 44–45, 48–50

Do not remake 11–16 or 26–50 hunts already HUNT-PASS. **#26** only after CC-1 #1–2. Next: IFTA leftover, `/tasks` hunt, `LINK-F5170` if still true, categories-catalog if still true.

---

## CC-3 · 9225 · leftover 62–63, 65, 67–75

Do not remake 51–61 / F6086 / parts / legal Complete. **#64 WO complete blocked** until CC-1 #6. Item 65 WO print if not proven. Second-pass `/lists` `/legal` unique only.

---

## Codex · 9226 · ACK GO-1350 · 76–100

Attach. **hop.assign prove** (FINDING if silent). Mint is CC-1. Grep #79 SETL before remaking. Hunt drivers/fleet/safety/fuel unique. Never restamp U14.

---

## Cascade · 101–125 · LIVE WALK NOW

OUTBOX is 9 days stale. Walk `/program` 28 cards on **current** healthz. False-green Complete = FINDING on board. No product PR. No U14 restamp.

---

## Devin / Devin-A · 126–150 · LIVE WALK NOW

Not PARKED. Same `/program` + Bill no. / Ref no. honesty. No product PR. File unique FINDING or AUDIT-PASS + SHA.

---

## Cursor · 151–175

Lead. One in-flight deploy. Unique leftover overflow. Do not steal CC-1 1–25.

---

OUTBOX ACK:

```
SEAT | ACK | GO-1350 | PORT=n | SHA=<healthz> | ITEM=<n> | KEY=<id> | FINDING=<id-or-none> | GO
```
