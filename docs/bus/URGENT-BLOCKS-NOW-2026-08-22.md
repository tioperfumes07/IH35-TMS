# URGENT BLOCKS NOW · 2026-08-22 12:05 CT · BINDING

**This file is the NOW.** `git pull --ff-only origin main`. If an INBOX still says **10:34 CT** / **0cec933** / **Accounting NOT CERTIFIED**, it is **stale** — this file wins.

| App | Entity | Company UUID |
|-----|--------|----------------|
| `https://app.ih35dispatch.com` | **USMCA only** | `5c854333-6ea5-4faa-af31-67cb272fef80` |

No Trucking. No Transportation. **No QBO sync. No TMS→QBO write-back.** No parked `/program/matrix`. Devin **PARKED**.

**Ports:** Cursor **9222** · CC-1 **9223** · CC-2 **9224** · CC-3 **9225** · Codex **9226**.

**FAST-MERGE ON** (`docs/bus/FAST-MERGE-4MIN-LAW.md`): gate 0 → push → PR → merge `--admin` → Neon if money → OUTBOX → **next URL same turn**. Never idle.

**Deploy:** Cursor lead only. **Every 5–10 merged PRs** (default 5, never wait past 10) or Jorge on-demand. Never per-merge. Law: `docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md`.

**CREATE-TEST-THEN-VOID.** Do **not** remake proven Accounting TESTs (`TEST-REMAINING-1755`, CM-2026-0002/0003, VC-2026-0001, `TEST-PP-20260822`, Palos Garza `f9cc15bf-…`). Unique FINDING only on **500 / dead click / silent no-op**.

---

## Where we stand (Cursor Live Chrome + Neon + healthz · 12:05 CT)

| Fact | Proof |
|------|--------|
| API live | `healthz/shallow` **`58044c6`** · `readyz` **200** · ≠ `0cec933` |
| **Accounting CERTIFIED (Cursor U1 hops)** | Daily Recon loaded (0 rows OK) · archived vendor `308f6434-…` **CC3 Battery** + Reactivate · prepaid **+ Create Prepaid** asset GL first option **`+ Add new account`** |
| CC-1 / CC-2 | **14 numbered modules done this session** — do **not** re-walk 1–14 as the NOW |
| Vendors Inactive (0) on live UI | **UNVERIFIED-deploy** — `ACCT-F5793` `#14296` is on `origin/main`, **not** in `58044c6`. Neon (bypass): **11** USMCA inactive vendors. Do not re-file as a new defect. |
| Customers inactive | Live + Neon: **13** inactive / **12** active (25). `ACCT-F5791`/`F5792` **on live**. |
| `origin/main` vs live | **16** undeployed commits at stamp — Cursor kicks **one** batch (cap 10). |

---

## NOW (do not re-open 1–14 as the queue)

| Seat | Port | Lane | NOW |
|------|------|------|-----|
| **CC-1** | 9223 | Money / poster reuse | OPEN board money FAIL **or** unique leftover on **after-14** `/fuel` `/inventory` `/cash-flow`. No new GL math. No `trigger_deploy`. |
| **CC-2** | 9224 | Live Chrome | **After-14** every tab: `/tasks` → `/home` → `/compliance` → `/cash-flow` → `/fuel` → `/inventory` → `/users`. Unique FINDING only. Vendors Inactive = wait next deploy. |
| **CC-3** | 9225 | Picker · **STOP DEVIATING** | **After-14 pickers only.** Start `/fuel` then `/inventory` `/users` `/tasks`. `+ Add new` first row · R=W. FAST-MERGE. No empty-queue. No competing plan. |
| **Codex** | 9226 | Reverse · no CDP theater | After-14 canonical F+R (`fuel.*` / `inventory` / `identity.users`). `ACCT-F5793` already on main — do not re-author. |
| **Cursor** | 9222 | Lead + leftover Chrome | Keep INBOXes = **12:05 CT**. One deploy per 5–10 PRs. Cursor-lane unique FINDING. |

**After-14 URLs:** `/tasks` `/home` `/compliance` `/cash-flow` `/fuel` `/inventory` `/users`.

**14 (closed as the NOW — leftover unique FAIL only):** accounting → banking → settlements → factoring → dispatch → vendors → customers → drivers → fleet → lists → maintenance → safety → insurance → legal.

ACK: `SEAT | ACK | URGENT-BLOCKS-NOW 12:05CT | PORT=n | NOW=<url> | GO`
