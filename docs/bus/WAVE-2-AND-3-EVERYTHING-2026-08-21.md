# SUPERSEDED as NOW (2026-08-22 12:05 CT)

Use `docs/bus/URGENT-BLOCKS-NOW-2026-08-22.md`. Historical ladder below — do not dispatch from this file.

# LAUNCH LADDER · MEASURED LIVE · 2026-08-21 12:00 CT

**Do not write NOW from memory.** This file’s NOW is from a live `/program/matrix?scope=system` read (no API-unavailable banner) + `healthz/shallow` + `origin/main` INBOX tops.

## Live instruments (measured, not guessed)

| Instrument | Value |
|------------|--------|
| API `healthz/shallow` | `200` `version=77f7844` `uptime_seconds≈387` (deploy `dep-da483sek1f9s73aso1r0` live) |
| `origin/main` at read | `125816194` Codex #13542 — **ahead of API** (matrix file lags until next API deploy) |
| App | `https://app.ih35dispatch.com/program/matrix?scope=system` USMCA · footer **`tip 77f7844de · refreshed 12:00:46 PM CT`** |
| Feed banner | **absent** (not fallback zeros) |
| Box 1 Required | **3363 / 3363** |
| Box 2 Audited | **3363 / 3363** |
| Box 3 Built | **3363 / 3363** (100% — CC-3 “unpaid Built” on accounting is **false** on this scoreboard) |
| Box 4 Live | **3122 / 3363** (93%) |
| Frozen Clicked | **3363 / 3363** |
| **Miss C** | **241 / 3363** (was 246/3365 on tip `d4a13f4`) |
| Named | 1405 · Leaves 1261 · Modals 401 · Clicked cells **3363** |
| Off-limits | No QBO sync · No Trucking · No Transportation · `eld` NEVER · close matrix after the glance |

**100% launch** = Fully-Wired **1–12** on **each** module (honest, reliable, trustworthy; QBO/NetSuite/McLeod/Alvys **quality**). Box 3 100% ≠ launch. Clicked 100% ≠ Miss C 0.

---

## Per-module Miss C (live table last column, 12:00 CT)

Urgent 6: accounting **0** · banking **0** · settlements **0** · factoring **0** · **dispatch 14** · vendors **0**  
Rest of urgent: customers **0** · drivers **0** · **fleet 49** · **lists 87**  
WAVE 2: **home 6** · **tasks 14** · driver-hub 0 · **compliance 6** · **safety 7** · **maintenance 41** · insurance 0 · legal 0 · **cash-flow 5** · finance 0 · form_425 0 · **fuel 5** · **inventory 5** · reports 0 · docs 0 · **users 2** · help 0 · program 0 · system 0  

Sum = 14+49+87+6+14+6+7+41+5+5+5+2 = **241**.

**Do not send seats to cash-flow / finance / program while dispatch/fleet/lists/maintenance still hold 14+49+87+41.**

---

## Sequence (owner) still stands — applied to **unpaid Miss C modules only**

1. **Urgent 6 leftover:** `/dispatch` only (14).
2. **Rest of urgent leftover:** `/fleet` (49) then `/lists` (87).
3. **The rest (WAVE 2 leftover):** `/maintenance` (41) → `/tasks` (14) → `/safety` (7) → `/home` (6) → `/compliance` (6) → `/cash-flow` (5) → `/fuel` (5) → `/inventory` (5) → `/users` (2).
4. **WAVE 3:** re-walk any cell that is still unpaid after stamps; CC-1 **creates** the five honest-zero scenario events (revrec, invoice+evidence, bank-path, real fuel, factoring advance) even when Miss C on that module is already 0.

Maps frozen. No new leaves.

---

## Seat NOW (from the live table)

| Seat | Port | NOW (this hour) | Then |
|------|------|-----------------|------|
| **CC-1** | 9223 | Unpaid **money** on `/dispatch` (14). Then `/fleet` then `/lists`. | `/maintenance` then WAVE 2 leftover list. Then **create** the 5 scenario events. Reuse poster. No QBO write-back. |
| **CC-2** | 9224 | Next unpaid frozen `` `leaf:col` `` on **dispatch** (14). OUTBOX `Miss C 241→M`. Skip `/login`. | fleet 49 → lists 87 → maintenance 41 → … |
| **CC-3** | 9225 | Box 3 is **100%** on the live scoreboard. Do **not** hunt “unpaid Built.” Chrome-law / picker / Save→reload on **dispatch** (module not launch-complete). No status-only PRs. | Same order as Miss C leftover list. |
| **Codex** | 9226 | Unpaid `connectivity`/`reverse_link` on **dispatch**, then fleet, then lists. No fake Checking-session PASS. | maintenance then WAVE 2 leftover list. |
| **Cursor** | 9222 | Frozen Clicked is **3363/3363** on this feed. Do **not** pretend Clicked leftovers are the gap. Bus: keep seats on the Miss C leftover list. **Do not** kick Render after each merge — batch-deploy every 5–10 merged PRs (`docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md`). | Item-12 only if a cell is actually unpaid Clicked after a **batch** deploy. |

ACK: `<SEAT> | ACK | LIVE-MATRIX | MISS-C-241 | PORT=<n> | NOW=<module> | GO`

---

## origin/main INBOX at this read (why Jorge saw no movement)

Seats pulling **main** still have: CC-2/CC-3 **NOW=/cash-flow**; CC-1 **factoring**; Codex **fleet**; Cursor **Clicked leftovers**. Live Miss C on cash-flow is **5**; dispatch/fleet/lists/maintenance are **14/49/87/41**. Those INBOXes were **not** live-verified. This file replaces them.
