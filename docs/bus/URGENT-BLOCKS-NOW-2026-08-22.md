# URGENT BLOCKS NOW · 2026-08-22 17:14 CT · BINDING · REJECT HOLD · CERTIFY U6 THEN 14

**This file is the NOW.** `git pull --ff-only origin main`. **16:55 CT + “awaiting next order” = STALE.** Owner 17:14 CT: **certify the urgent 6, then continue the rest of the 14. CC-2 is holding — FORBIDDEN. Instruct all coders. Jorge is not the messenger.**

| App | Entity | Company UUID |
|-----|--------|----------------|
| `https://app.ih35dispatch.com` | **USMCA only** | `5c854333-6ea5-4faa-af31-67cb272fef80` |

**Trucking · Transportation · QBO sync = irrelevant.** No TMS→QBO write-back. FAST-MERGE ON. CREATE-TEST-THEN-VOID. Unique FINDING only on **500 / dead click / silent no-op**.

**Ports:** Cursor **9222** · CC-1 **9223** · CC-2 **9224** · CC-3 **9225** · Codex **9226**. Devin **PARKED**.

**HOLD / idle / stand-by / “awaiting next order” / healthz-watch as the only activity = DEFECT.** Empty unique-FINDING queue → help Cursor Live-verify on a **named URL below**, same turn.

Live `healthz` **`bad0c84`**. `origin/main` is **≥10 commits** ahead → Cursor lead **one** API deploy (never per-merge, never a second in-flight).

Certify = Fully-Wired **1–12**. Clicked ≠ CERTIFIED. Accounting **CERTIFIED**. Do not remake Accounting TESTs.

---

## Urgent 6 then rest of 14 (order locked)

| # | Module | Certify status | Cursor 9222 | Other seats |
|---|--------|----------------|-------------|-------------|
| 1 | Accounting | **CERTIFIED** | unique leftover only | nobody unless unique FAIL |
| 2 | Banking | Live hops open | **NOW:** TEST match → recon Accept → ledger. Do not Close period with 0 sessions. | CC-1: **do not occupy `/banking*`** |
| 3 | Settlements | Close hop proven S-20260811-0032 TEST method $0 | unique leftover only | CC-2: **do not re-close** |
| 4 | Factoring | Chargebacks Advance $1,794.50 live | unique leftover only | CC-2 after-14 first |
| 5 | Dispatch | Board mounts. Do not remake Book Load | unique leftover only | — |
| 6 | Vendors | 119 / Inactive 11 proven | unique leftover only | — |
| 7 | Customers | 25 / Inactive 13 proven | Live leftover after U6 | **Codex reverse** |
| 8 | Drivers | mounts | Live leftover | **Codex reverse** |
| 9 | Fleet | mounts | Live leftover | **Codex reverse** |
| 10 | Lists | hub mounts | after CC-3 | **CC-3** after legal |
| 11–13 | Maint / Safety / Insurance | hops proven | leftover unique | Cursor |
| 14 | Legal | CC-3 pickers | after CC-3 | **CC-3 NOW** |

---

## Per-seat NOW (ACK required · numbered URL · then GO)

| Seat | Port | NOW (do this, in order) | FORBIDDEN |
|------|------|-------------------------|-----------|
| **Cursor** | 9222 | 1) `/banking/transactions` match TEST · 2) `/banking/reconciliation` Accept · 3) then customers→drivers→fleet leftover · skip `/legal` while CC-3 | second Render kick · remake Accounting TESTs |
| **CC-1** | 9223 | 1) grep-verify **ACCT-F5965** vs main (`#14432` / `01bc6bce2`) — if merged, mark board FIXED · 2) next **OPEN money FAIL** on `GUARD-WORKORDERS.md` · 3) empty → unique 500 only | occupy `/banking*` · HOLD · invent 15th plan |
| **CC-2** | 9224 | **REJECT HOLD.** 1) `https://app.ih35dispatch.com/tasks` 2) `/home` 3) `/compliance` 4) `/cash-flow` — unique FINDING only. Then OUTBOX + next URL same turn. | awaiting next order · idle · `/banking*` · remake Close settlement |
| **CC-3** | 9225 | 1) `https://app.ih35dispatch.com/legal` pickers 2) then `/lists` leftover `+ Add new` | `/banking*` `/dispatch` `/maintenance` `/safety` |
| **Codex** | 9226 | `mdata.customers` → `mdata.drivers` → `mdata.units` reverse SQL/GET. **No CDP.** | Chrome clash · idle |

ACK: `SEAT | ACK | URGENT-BLOCKS-NOW 17:14CT | PORT=n | NOW=<first URL> | GO`
