# URGENT BLOCKS NOW · 2026-08-22 10:34 CT · BINDING · 14 MODULES

**This file is the NOW.** `git pull --ff-only origin main`. If your INBOX disagrees with **10:34 CT**, this file wins.

Claiming **stale** / **drained** / **empty-queue** / **awaiting next order** / **waiting Cursor** / **waiting healthz** / **Accounting already certified** after this pull is a **process defect**.

| App | Entity | Company UUID |
|-----|--------|----------------|
| `https://app.ih35dispatch.com` | **USMCA only** | `5c854333-6ea5-4faa-af31-67cb272fef80` |

Switcher **must** show USMCA. No Trucking. No Transportation. **No QBO sync. No TMS→QBO write-back.** No `eld`. No parked `/program/matrix`. Devin-A **PARKED**.

**Ports:** Cursor **9222** · CC-1 **9223** · CC-2 **9224** · CC-3 **9225** · Codex **9226**.

**Quality bar (launch today):** McLeod ops seriousness · QuickBooks trust (chrome + books, not QBO write-back) · NetSuite controls (audit, entity scope, WORM) · Alvys workflow. Honesty: CI-green ≠ live. Empty TMS is **expected**. **CREATE-TEST-THEN-VOID.** Unique FINDING only on **500 / dead click / silent no-op**. Do not invent “zero defects” without a click this session after **this** pull.

**Law:** `docs/lockdown/CREATE-TEST-THEN-VOID-LAW-2026-08-22.md` · Fully-Wired 1–12 · `docs/bus/FAST-MERGE-4MIN-LAW.md` · `docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md` · USMCA-only until launch.

**Render:** Cursor only, Desktop `/Users/jorgemunoz/Desktop/APIS-ALL-05-29-2026.rtfd`. **No `trigger_deploy` from CC-1/2/3/Codex.** Measured 10:34 CT: live `healthz` **`0cec933`** (uptime ~5602s). Prior batch `dep-da4qm10jo6nc73dqu0qg` **update_failed**. Replacement **one** kick `dep-da4s3m3l550s738ql90g` commit `26242d426b59`. **Do not stack.** Idle / “09:08 sequence closed” / “awaiting next order” after this pull is a **process defect**.

---

## FAST-MERGE (every ship, ~4–5 min)

1. **Gate:** CC-1/CC-2/CC-3/Codex `node scripts/money-pr-local-gate.mjs` → exit 0. Cursor `node scripts/ops/cursor-ship-preflight.mjs --body-file /tmp/pr-body.txt` → exit 0. FINDING-first commit. One FINDING. Guard on wiring. Tip contains `origin/main`.
2. **Push:** `git push`. If blocked **only** by `verify-static-fallback` ENV / no local PG → `git push --no-verify` **after** step 1 PASS.
3. **PR:** `gh pr create` — **never** `gh pr checks --watch`.
4. **Merge:** `gh pr merge N --squash --delete-branch --admin` immediately.
5. **Neon:** money/migrations — **you** apply + one query proof.
6. **OUTBOX** first line → **next URL same turn**. Continuous. Never idle.

**Forbidden:** merge with gate FAIL · `--no-verify` before gate PASS · `--no-verify` for **your** red guard · wait Jorge to merge · For-review drain · Close month · remake proven Accounting TESTs.

**Bands:** Cursor EVEN verify-steps · CC-1 ≡1 (mod 4) · CC-2 ≡3 (mod 4). Claim-before-write. No CLAIMED json in feature PRs.

---

## Accounting honesty (U1)

CREATE-TEST hops are **proven** — **do not remake:**

| Proven | Artifact |
|--------|----------|
| Bill remaining / Record Payment | `TEST-REMAINING-1755` |
| Apply AR credit | CM-2026-0002 / 0003 |
| Apply AP vendor credit | VC-2026-0001 |
| Prepaid | `TEST-PP-20260822` |
| Bank split sample | Palos Garza `f9cc15bf-…` |
| Sales-tax agency | CC-2 TEST agency (do not duplicate) |

**CERTIFY:** Cursor Live Chrome **only** when `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` `version` **≠** `0cec933` **and** authenticated Daily Recon **200**, then Daily Recon click + archived vendor `308f6434-0a51-4109-953e-c86ffb1f0999` + prepaid Create GL pickers. **Measured 10:34 CT: still `0cec933` → Accounting is NOT CERTIFIED.** Unauthenticated recon is **401**. That is **not** a seat idle. Execute **#2–#14 now**; after-14 if your 14 URLs were already opened **this pull**.

---

## The 14 (this order — never skip ahead)

| # | Module | Home URL |
|---|--------|----------|
| 1 | Accounting | `https://app.ih35dispatch.com/accounting` |
| 2 | Banking | `https://app.ih35dispatch.com/banking` |
| 3 | Settlements | `https://app.ih35dispatch.com/driver-finance/settlements` |
| 4 | Factoring | `https://app.ih35dispatch.com/factoring` |
| 5 | Dispatch | `https://app.ih35dispatch.com/dispatch` |
| 6 | Vendors | `https://app.ih35dispatch.com/vendors` |
| 7 | Customers | `https://app.ih35dispatch.com/customers` |
| 8 | Drivers | `https://app.ih35dispatch.com/drivers` |
| 9 | Fleet | `https://app.ih35dispatch.com/fleet` |
| 10 | Lists | `https://app.ih35dispatch.com/lists` |
| 11 | Maintenance | `https://app.ih35dispatch.com/maintenance` |
| 12 | Safety | `https://app.ih35dispatch.com/safety` |
| 13 | Insurance | `https://app.ih35dispatch.com/insurance` |
| 14 | Legal | `https://app.ih35dispatch.com/legal` |

**After 14 only:** `/tasks` → `/home` → `/compliance` → `/cash-flow` → `/fuel` → `/inventory` → `/users`.

**How (every leaf):** one URL on **your** port → prove → **close the tab**. Unproven wizard: one labeled **TEST DATA** save → reload → canonical. Memo `TEST DATA VOID-AT-LAUNCH`. Placeholders `$1,200` / `$1.20/mi`. Proven: click-through only.

---

## Per-seat ownership across all 14

### CC-1 · 9223 · MONEY / GL (reuse poster — no new GL math)

OPEN `docs/audit/GUARD-WORKORDERS.md` money row in-lane **beats** a green click.

| # | Module | What you do |
|---|--------|-------------|
| 1 | Accounting | Unique money FAIL only. **Do not** remake proven TESTs. No Close month. |
| 2 | Banking | Money hop (payment/match **sample**, escrow, register dollars). **Do not** drain For-review. Factoring = secured borrowing, not sale. |
| 3 | Settlements | Close / deduction / pay-run / cash advance money. `driver_finance.*` only. |
| 4 | Factoring | Advance / packet / fee / reserve **money**. Faro terms. Recourse. Owner-manual reserves — do not create reserve accounts. |
| 5 | Dispatch | Book Load **persist** (not posting). Rate/accessorial TEST if unproven. |
| 6 | Vendors | Vendor bill/expense/payment leftover. Canonical `mdata.vendors`. |
| 7 | Customers | Invoice / AR payment leftover. Canonical `mdata.customers`. |
| 8 | Drivers | Driver-as-vendor / settlement money leftover. |
| 9 | Fleet | USMCA **leases** equipment — **no** PP&E / Accum Depr on USMCA. Money only if a real FAIL (lease/bill). |
| 10 | Lists | CoA **bindings** / purpose leftover — do not invent accounts. No TRANSP/USMCA Vehicles/FixedAsset/AccumDepr TMS-native. |
| 11 | Maintenance | WO → bill/expense via **existing poster**. |
| 12 | Safety | Fine / liability money leftover. |
| 13 | Insurance | Claim → bill/deductible leftover. Forward+reverse money terminus. |
| 14 | Legal | Matter → bill leftover. |

Then after-14 money only if a named FAIL.

### CC-2 · 9224 · LIVE CHROME (every tab)

Every **sub-nav tab** on the module. Dead click / 500 / silent no-op = FINDING + FAST-MERGE. One TEST wizard if **that** hop is unproven.

| # | Module | What you click |
|---|--------|----------------|
| 1 | Accounting | Do **not** remake proven TESTs. Leftover tabs only if unpaid Live. Certify is Cursor. |
| 2 | Banking | Home, account, For-review **sample only**, Relay `/banking/relay`, Plaid/Connections if in nav. |
| 3 | Settlements | List, close, cash advances, liabilities, disputes, pay-rate, deductions. |
| 4 | Factoring | Recourse pipeline, packets, queue, advances. |
| 5 | Dispatch | Board + Book Load **one** TEST load if unproven. |
| 6 | Vendors | List + one detail (not `308f6434` until SHA ≠ `0cec933`). |
| 7 | Customers | List + detail + create if unproven. |
| 8 | Drivers | Profiles, settlements, cash advances, permits tabs. |
| 9 | Fleet | Units + trailers tabs. |
| 10 | Lists | Catalog cards → correct list. |
| 11 | Maintenance | WO list + create chrome. |
| 12 | Safety | Accidents / fines / meetings tabs in design. |
| 13 | Insurance | Policies / claims tabs. |
| 14 | Legal | Matters tabs. |

### CC-3 · 9225 · PICKER + `+ Create` (V2)

`+ Add new` is the **first row inside the dropdown**. Same wizard Lists uses. Save → appears + selected + survives reload. R=W canonical table. Entity-scoped.

| # | Module | Pickers |
|---|--------|---------|
| 1 | Accounting | Leftover pickers only (prepaid GL **after** SHA moves). |
| 2–6 | Banking→Vendors | Vendor/customer/account/load pickers on those homes. |
| 7 | Customers | `+ Create` / nested `+ Add new`. |
| 8 | Drivers | Driver create + nested catalogs. |
| 9 | Fleet | Unit/trailer pickers. |
| 10 | Lists | Card → list → `+ Create` → canonical. |
| 11 | Maintenance | Vendor/unit on WO. |
| 12 | Safety | Driver/unit/load pickers. |
| 13 | Insurance | Policy/driver/unit/load on claim. |
| 14 | Legal | Matter linkage pickers. |

### Codex · 9226 · REVERSE + CONNECTIVITY (no CDP theater)

Prove with SQL/GET/guard. Canonical tables. Forward **and** reverse. Memo-only UUID = FAIL.

| # | Module | Canonical |
|---|--------|-----------|
| 1 | Accounting | `accounting.*` / `catalogs.accounts` — leftover reverse only. |
| 2 | Banking | `banking.*` never `bank.*`. |
| 3 | Settlements | `driver_finance.*` never payroll. |
| 4 | Factoring | `_cents` live; invoice/customer reverse. |
| 5 | Dispatch | `mdata.loads`. |
| 6 | Vendors | `mdata.vendors`. Archived `308f6434` 404 = UNVERIFIED-deploy — **do not idle**. |
| 7 | Customers | `mdata.customers`. |
| 8 | Drivers | `mdata.drivers`. |
| 9 | Fleet | `mdata.units` (owner/lease — **no** `operating_company_id` on units). |
| 10 | Lists | Catalog R=W. |
| 11 | Maintenance | `maintenance.*` never `maint.*`. |
| 12 | Safety | `safety.*` F+R. |
| 13 | Insurance | Claim graph F+R. |
| 14 | Legal | Matter ↔ claim/bill F+R. |

### Cursor · 9222 · LEAD + CERTIFY + WIRING

1. Keep this file + INBOXes = **10:34 CT**. Seats that say **09:08 sequence closed** / **04:11 CT** / **awaiting next order** **did not pull**.
2. Render: one in-flight deploy max. **No second kick.** When `healthz` ≠ `0cec933`: Daily Recon 200 + archived vendor + prepaid pickers → then stamp Accounting certify **only if those pass**.
3. Cursor-lane wiring FAILs (EVEN steps). FAST-MERGE.
4. After U1 certify attempt: same Live leftover as CC-2 on unpaid 2–14.
5. Never freeze seats on U1.

---

## ACK (first OUTBOX line after pull)

```text
<SEAT> | ACK | URGENT-BLOCKS-NOW 10:34CT | PORT=<n> | NOW=<first URL in your INBOX> | GO
```
