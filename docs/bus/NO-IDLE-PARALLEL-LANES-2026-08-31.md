# NO IDLE · TWO LANES (shift law — owner 2026-08-31)

**PARTITION:** `docs/bus/FARO-PARTITION-REV-E-2026-08-31.md` — **HOLD REV D.**

**WAITING ON ANOTHER SEAT, A DEPLOY, OR A MERGE = PROCESS DEFECT.**

## REV E (crosswalk — one owner per row)

| Seat | Scope |
|------|-------|
| CC-1 | 016 · 004/L13512 · settlements |
| CC-3 | inv **001–013** invoice-only (skip 004) — **no loads** |
| Codex | inv **014–024** + their loads — both ends |
| Devin-A | inv **025, 027–036** + their loads — both ends |
| Cascade | loads **13508–13520** deliver only — **no invoice create** |
| CC-2 | tie-outs + grade |

**Gate:** no 014+ invoice create until `one-load-one-open-invoice` on main.

Every seat holds **BLOCKING** and **FREE** queues. The instant BLOCKING stalls, switch to FREE **without asking Jorge**. Announcing "blocked" and stopping is forbidden.

| Lane | Needs live app / deploy? |
|------|---------------------------|
| **FREE** | No — Neon read-only, tie-out logic, guards, FE, specs, tests, manifest honesty |
| **BLOCKING** | Yes — Chrome create, prod_verified, grading live hops |

Only Cursor deploys (Rule 42). **Nobody waits for deploy** — FREE lane until SHA catches up.

Canonical packet: `docs/lockdown/Coders-Faro/`

---

## Money — four seats (REV D — owner: no serialization)

| Seat | Faro invoices |
|------|---------------|
| CC-1 | **016 only** (+ specimen 004/L13512 Chrome) |
| CC-3 | **001–011** |
| Codex | **012–024** (MONEY-3) |
| CC-2 | grade only — never idle waiting |

## Chrome loads — three seats

| Seat | Load numbers |
|------|--------------|
| Cascade | **13508–13520** |
| Devin-A | **13521–13538** (CHROME-2 · port 9227) |
| CC-1 | **13512** specimen only |

## CC-3 — never wait on CC-1

**BLOCKING:** inv **001–011** only. First row **001 REHMANN $3,600**. Skip 004 and 016.

**FREE:** VEND tie-out · VEND-CERT · repurchase guards

## Codex — MONEY-3 — never wait on CC-1 or CC-3 batch

**BLOCKING:** inv **012–024**. First row **012 CTS $4,000**. Then bank 8–10 when **your** advances land.

**FREE:** `bank-ledger-closing.mjs` run · BANK root-cause

## Devin-A — CHROME-2 — never wait on Cascade or CC-1

**BLOCKING:** Book Load **13521** first → **13538** from AUG-LOADS CSV.

**FREE:** unique FINDING on dispatch/customers surfaces touched

---

## CC-2 — never wait on CC-1 or CC-3

**Do NOT** sit idle for advances, 016, or deploy. Grade is **opportunistic** when data exists — not your only job.

**FREE (primary until hops exist):**
1. Run **every** tie-out script vs Neon → board OBSERVED (honest FAIL is success):
   - `settlement-pdf-5753.mjs` · `accounting-trial-balance.mjs` · `faro-factoring-statement.mjs`
   - `vendors-ap-aging.mjs` · `bank-ledger-closing.mjs` · `dispatch-delivered-revenue.mjs`
2. Manifest honesty: `safety` complete:true with 4 HOLDs → flip false; `users` 6/6 PASS → flip complete or document why not
3. Planner UI tests — `docs/lockdown/IH35-HANDOFF-2026-08-31/specs/GO-PLANNER-UI-DEFECTS-2026-08-31.md`
4. Author Faro repurchase guards (migration already written)

**BLOCKING (when CC-3/CC-1 land data):** grade hop → bind `prod_verified` → FACT re-run → board delta. **Then back to FREE queue.**

---

## Cascade — never wait on CC-1

**BLOCKING:** Book Load USMCA from `CC-1-AUG-LOADS-BY-FACTOR.csv` — start 13512.

**FREE:** DISP tie-out already filled on main — run it, report orphans; planner UI; load-creation guards.

---

## Codex — never wait on advances for everything

**FREE:** `bank-ledger-closing.mjs` run + OBSERVED · BANK-SURF/ECON root-cause read (no fabricate PASS).

**BLOCKING:** bank shadow steps 8–10 when advances exist — **not** idle until then.

---

## CC-1 (unchanged primary)

016 → L13512 12-step → settlements USMCA portion. Does **not** own all 33 Faro factors — CC-3 owns the other 32.

---

## Cursor lead

Enforce this file on every INBOX bump. Merge · deploy cadence 5–10 PRs · **never** end a turn with CC-2/CC-3 idle language.
