# URGENT BLOCKS NOW · 2026-08-22 08:54 CT · BINDING

**This file is the NOW.** Pull `origin/main`. If your INBOX disagrees with **this timestamp**, this file wins. Claiming **stale** / **drained** / **empty-queue** / **awaiting next order** / **waiting Cursor** / **waiting healthz** after this pull is a **process defect**.

| App | Entity | Company UUID |
|-----|--------|----------------|
| `https://app.ih35dispatch.com` | **USMCA only** | `5c854333-6ea5-4faa-af31-67cb272fef80` |

Switcher must show USMCA. No Trucking. No Transportation. No QBO sync. No TMS→QBO write-back. No `eld`. No `/program/matrix` parked tab.

**Ports (do not steal):** Cursor **9222** · CC-1 **9223** · CC-2 **9224** · CC-3 **9225** · Codex **9226**. Devin-A **PARKED**.

**Law:** `docs/lockdown/CREATE-TEST-THEN-VOID-LAW-2026-08-22.md` · Fully-Wired 1–12 · FAST-MERGE · `docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md`.

**Render (Cursor only, one batch):** authenticate from Desktop APIs file `/Users/jorgemunoz/Desktop/APIS-ALL-05-29-2026.rtfd` (`APIS-ACCESS.md`). **Do not skip auth.** MCP login card is optional; the Desktop key is the auth. **No `trigger_deploy` from CC-1 / CC-2 / CC-3 / Codex.** Cursor: **one** API deploy after merges are on `main`. Do not stack.

---

## How (every seat, every leaf)

1. `git pull --ff-only origin main`
2. Open **one** URL below on **your** port. Prove it. **Close the tab.**
3. If the wizard is **unproven**: one labeled **TEST DATA** create → save → **reload** → canonical row. Memo `TEST DATA VOID-AT-LAUNCH`. Placeholders `$1,200` / `$1.20` / remainder on an open TEST bill.
4. If the wizard is **already proven** (list below): **do not remake**. Click through; unique FINDING only on **500 / dead click / silent no-op**.
5. Unique FINDING = one PR: code + guard `scripts/verify-*.mjs` + EVEN/band claim sequence + `cursor-ship-preflight` / money gate + FAST-MERGE.
6. OUTBOX **first line** same turn: `SEAT | ACK | URGENT-BLOCKS-NOW 08:54CT | PORT=n | NOW=<exact URL> | GO`
7. Then the **next URL in YOUR list**. Never invent “module dry” while a URL in your list is unopened this session.

**Forbidden:** wait Jorge · wait Cursor · wait `healthz` as idle · remake Accounting proven hops · drain Banking For-review · Close month · second Render deploy from a coder seat · inventory while your list is unfinished.

---

## Accounting — CLOSED for CREATE-TEST (do not remake)

| Proven | Artifact |
|--------|----------|
| Bill remaining / Record Payment | `TEST-REMAINING-1755` $300 paid $200 open $100 |
| Apply AR credit | CM-2026-0002 / 0003 applied |
| Apply AP vendor credit | VC-2026-0001 applied |
| Prepaid | `TEST-PP-20260822` $1,200 / 12 periods |
| Bank split sample | Palos Garza txn `f9cc15bf-…` two vendors |
| Sales-tax agency | CC-2 TEST agency (do not duplicate) |

**CERTIFY (Cursor Live Chrome, after the one batch deploy is live):** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` `version` ≠ `0cec933` **and** `GET /api/v1/accounting/daily-recon` is **200**, then re-click Daily Recon + archived vendor `308f6434-…` + prepaid Create GL pickers. **That is not a seat idle.** Seats execute U2–U6 / R1–R4 **now**.

---

## Sequence (all urgent — do in this order, never skip ahead)

**Urgent 6**

| # | Module | Home URL |
|---|--------|----------|
| U1 | Accounting | `/accounting` — CREATE-TEST **done**; certify = Cursor after the **one** batch deploy |
| U2 | Banking | `/banking` |
| U3 | Settlements | `/driver-finance/settlements` |
| U4 | Factoring | `/factoring` |
| U5 | Dispatch | `/dispatch` |
| U6 | Vendors | `/vendors` |

**Rest of urgent**

| # | Module | Home URL |
|---|--------|----------|
| R1 | Customers | `/customers` |
| R2 | Drivers | `/drivers` |
| R3 | Fleet | `/fleet` |
| R4 | Lists | `/lists` |

**Then WAVE 2 leftover (only after R4)**

`/maintenance` → `/tasks` → `/safety` → `/home` → `/compliance` → `/cash-flow` → `/fuel` → `/inventory` → `/users`

---

## Per-seat NOW (08:54 CT) — exact next clicks

### CC-1 · 9223 · MONEY

**NOW:** U2 Banking money, then U3, U4. Not Accounting remakes.

| Order | Where | What / how |
|-------|--------|------------|
| 1 | `https://app.ih35dispatch.com/banking` | Unpaid **money** FAIL from `docs/audit/GUARD-WORKORDERS.md` in your lane. Reuse poster. No new GL math. |
| 2 | Same module: expense/bill/payment only if that hop is **unproven** | One TEST. **Do not** Match/Categorize the rest of For-review. |
| 3 | `https://app.ih35dispatch.com/driver-finance/settlements` | Settlement close / deduction / pay-run **money** leftover. One TEST if unproven. |
| 4 | `https://app.ih35dispatch.com/factoring` | Advance / packet money leftover. One TEST if unproven. Faro terms. |
| 5 | `/dispatch` then `/vendors` | Money hops only (Book Load persist is not GL math; still USMCA). |

OPEN board money row beats a green click. File other-lane defects on the board same turn.

### CC-2 · 9224 · LIVE CHROME

**NOW:** U2 then U3. Click every **tab** on the module.

| Order | Where | What / how |
|-------|--------|------------|
| 1 | `/banking` | Home, an account, For review **sample only** (already split). Relay `/banking/relay`. Plaid/Connections if in nav. Dead click = FINDING. |
| 2 | `/driver-finance/settlements` | List, close, cash advances, liabilities, disputes, pay-rate templates, deductions — each tab. |
| 3 | `/factoring` | Recourse pipeline, packets, queue. |
| 4 | `/dispatch` | Board + Book Load wizard **one** TEST load if unproven. |
| 5 | `/vendors` | List + one vendor detail (not `308f6434` until API SHA moves). |
| 6 | `/customers` → `/drivers` → `/fleet` → `/lists` | Rest of urgent Live. |

### CC-3 · 9225 · CHROME + PICKER

**NOW:** R1→R4 (customers first). Urgent 6 chrome only if you find a **picker** FAIL on U2–U6 while CC-2 is on Live.

| Order | Where | What / how |
|-------|--------|------------|
| 1 | `/customers` | `+ Create` / `+ Add new` **first row** in dropdown → same wizard Lists would use → save → appears selected after reload. |
| 2 | `/drivers` | Same picker law. Tabs: profiles, settlements, cash advances, permits. |
| 3 | `/fleet` | Units/trailers pickers. |
| 4 | `/lists` | Catalog cards → correct list → `+ Create` → canonical table. |
| 5 | Then WAVE 2 `/maintenance` pickers. |

No status-only PRs. No “Built 100% so idle.”

### Codex · 9226 · REVERSE + CONNECTIVITY · NO CDP unless proving a reverse click you already coded

**NOW:** U2 then U3 code reverse.

| Order | Where (code + live GET) | What / how |
|-------|-------------------------|------------|
| 1 | Banking | Canonical `banking.*` (not `bank.*`). Forward FK + reverse query/endpoint returns the row. Guard. |
| 2 | Settlements | `driver_finance.*` (not payroll). Reverse from driver/load/liability. |
| 3 | Factoring | Invoice/customer reverse; `_cents` columns not dead JSONB. |
| 4 | Dispatch | `mdata.loads` reverse. |
| 5 | Vendors | `mdata.vendors` GET; archived detail is UNVERIFIED-deploy until SHA moves — **do not idle on it**. Next unpaid reverse. |

No fake reverse PASS. No Chrome login theater.

### Cursor · 9222 · LEAD + CERTIFY AFTER ONE BATCH DEPLOY

| Order | Where | What / how |
|-------|--------|------------|
| 1 | Desktop APIs + Render API | Auth from `APIS-ALL-05-29-2026.rtfd`. Set live `healthCheckPath=/api/v1/healthz/readyz` (must match `render.yaml`). **One** `POST /deploys` of current `origin/main`. Never per-merge. Never stack. |
| 2 | When `healthz` ≠ `0cec933` | `/accounting/daily-recon` must 200. Archived vendor `308f6434`. Prepaid Create GL pickers. Then stamp Accounting certify **only** if those pass. Then U2–U6 Live leftover. |
| 3 | Until SHA moves | Seats **GO** U2–R4. Cursor-lane wiring FAILs (EVEN verify-steps, no CLAIMED in feature PR). |
| 4 | After Accounting certify | Same U2→R4 sequence as CC-2 if a leaf is still unpaid Live. |

---

## ACK (every seat, first OUTBOX line after pull)

```text
<SEAT> | ACK | URGENT-BLOCKS-NOW 08:54CT | PORT=<n> | NOW=<first URL in your table> | GO
```
