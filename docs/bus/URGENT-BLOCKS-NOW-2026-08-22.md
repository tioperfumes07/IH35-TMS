# URGENT BLOCKS NOW · 2026-08-22 12:28 CT · BINDING · ANTI-CLASH

**This file is the NOW.** `git pull --ff-only origin main`. 12:05 CT / after-14-as-queue / “14 done so idle” is **stale**.

| App | Entity | Company UUID |
|-----|--------|----------------|
| `https://app.ih35dispatch.com` | **USMCA only** | `5c854333-6ea5-4faa-af31-67cb272fef80` |

**Trucking · Transportation · QBO sync = irrelevant** until USMCA is launched. No TMS→QBO write-back. Law: `docs/lockdown/USMCA-LAUNCH-FIRST-STANDING-LAW-2026-08-22.md`.

**Ports (HARD — one seat, one port, never share a URL prefix):** Cursor **9222** · CC-1 **9223** · CC-2 **9224** · CC-3 **9225** · Codex **9226**. Devin **PARKED**. Close the tab after the hop.

**FAST-MERGE ON** (~4–5 min): gate 0 → push → PR → merge `--admin` → Neon if money → OUTBOX → **your next assigned URL**. Never idle.

**Deploy:** Cursor lead only. Every **5–10 minutes** and every **5–10 merged PRs** (never wait past 10). One in-flight. Never per-merge.

**CREATE-TEST-THEN-VOID.** Do **not** remake Accounting TESTs (`TEST-REMAINING-1755`, CM-2026-0002/0003, VC-2026-0001, `TEST-PP-20260822`, Palos Garza `f9cc15bf-…`). Unique FINDING only on **500 / dead click / silent no-op**. After launch: void TESTs and clean.

---

## Live probe (Cursor 9222 · healthz **`408d0c4`** · readyz 200 · 12:28 CT)

All 14 **mounted** (no 500 / no login bounce). Settlements URL is **`/driver-finance/settlements`** (not `/settlements`). Insurance URL is **`/safety/insurance`** (Insurance Dashboard live; coverage gaps **44**). `/insurance` redirects into Safety home — do not file that as a crash.

| # | Module | Live now | Still needed to **certify** (this pass) | Who |
|---|--------|----------|------------------------------------------|-----|
| 1 | Accounting | CERTIFIED (U1 hops). Do not remake TESTs. | Unique leftover only | **nobody unless unique FAIL** |
| 2 | Banking | Home mounts | TEST **expense → match → reconcile → ledger** (labeled TEST DATA) | **CC-1 only** |
| 3 | Settlements | `Driver Settlements` mounts | Close / pay-run / leftover tabs — unique FINDING | **CC-2 only** |
| 4 | Factoring | Faro home mounts | Recourse / batch leftover — unique FINDING | **CC-2 after #3** |
| 5 | Dispatch | Board mounts | Unique FINDING only. Do **not** remake Book Load | **CC-3 only** |
| 6 | Vendors | Roster mounts. Inactive **(11)** already proven | Unique FINDING only. Do **not** re-click Inactive as work | **skip unless unique FAIL** |
| 7 | Customers | Roster mounts. Inactive **13** already proven | Reverse F+R (no CDP) | **Codex only** |
| 8 | Drivers | Roster mounts | Reverse F+R (no CDP) | **Codex only** |
| 9 | Fleet | Roster mounts | Reverse F+R (no CDP) | **Codex only** |
| 10 | Lists | Hub mounts | Picker leftover `+ Add new` first row | **CC-3 after #5** |
| 11 | Maintenance | Mounts | Unique FINDING / leftover Live | **Cursor 9222** |
| 12 | Safety | `/safety/home` mounts | Unique FINDING | **Cursor 9222** |
| 13 | Insurance | `/safety/insurance` dashboard live (44 gaps) | Claims / lawsuits leftover unique FINDING | **Cursor 9222** |
| 14 | Legal | Mounts | Unique FINDING | **Cursor 9222** |

---

## ANTI-CLASH (crash prevention)

| Seat | Port | YOU MAY OPEN | YOU MAY NOT OPEN |
|------|------|----------------|------------------|
| **CC-1** | 9223 | `/banking` `/banking/reconciliation` `/banking/transactions` `/accounting/expenses` (TEST expense only) | `/dispatch` `/factoring` `/driver-finance/*` `/lists` `/maintenance` `/safety*` `/legal` `/vendors` `/customers` `/drivers` `/fleet` |
| **CC-2** | 9224 | `/driver-finance/settlements` `/driver-finance/settlement-close` `/cash-advances` `/factoring` | `/banking*` `/dispatch` `/lists` `/maintenance` `/safety*` `/legal` `/accounting` (except if CC-1 pings a money FAIL) |
| **CC-3** | 9225 | `/dispatch` `/lists` (pickers) | `/banking*` `/driver-finance/*` `/factoring` `/maintenance` `/safety*` `/legal` · no Inactive vendors tab |
| **Codex** | 9226 | SQL/GET/guard on `mdata.customers` `mdata.drivers` `mdata.units` | **No CDP.** No `/banking` chrome. Do not re-author ACCT-F5793 |
| **Cursor** | 9222 | `/maintenance` `/safety` `/safety/insurance` `/legal` · lead · deploy | `/banking*` while CC-1 is on it · `/driver-finance/*` · `/dispatch` · `/factoring` |

One URL → prove → **close the tab**. Never two seats on the same path. File FAILs to the owning OUTBOX (money → CC-1, picker → CC-3, Live crash → CC-2) **and** OUTBOX-CURSOR.

ACK: `SEAT | ACK | URGENT-BLOCKS-NOW 12:28CT | PORT=n | NOW=<your first URL> | GO`
