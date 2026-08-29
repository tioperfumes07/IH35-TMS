# GO-0105 — ALL SEATS THIS IS NOW (idle = defect)

`git pull --ff-only origin main`  
Instruction = this packet + `docs/bus/FEED/NOW-<SEAT>.md`

**ACK:** `SEAT | ACK | GO-0105 | NOW=<from your FEED> | SHA=<healthz/shallow version> | GO`

U14 **14/14 CONCLUDED. Never recertify.** Skip PR **#15546** **#16895**. KEEP TEST. No PROG-01. Nobody except Cursor `trigger_deploy`. Deploy **5–10 min AND 5–10 PRs**, one in-flight.

---

## LAW THIS WAVE (every seat)

1. **Healthz truth.** `GET /api/v1/healthz/shallow` is **version + process only** (`ok` is always true). Check verdicts = **`GET /api/v1/healthz`**.
2. **H4 is code on main, not proven live until** live `healthz/shallow.version` is an **ancestor of `22b1b63e4`**. Then re-read **full** `/healthz`. Expected: `background_jobs.stale` **clears**. If it stays FAIL → **surprising** → Render API app log (`srv-d7rpem7avr4c73fhp4n0`), filter `stale_jobs` or `health_check_failed` → `internal_error`. **Do not guess job names from public JSON** (SEC-HEALTHZ-01, token only).
3. **Incident (live `b2448ce`, pre-H4):** entire yellow was  
   `integrations.qbo_inbound_sync:11841.4m | integrations.qbo_cdc_poll:11843.6m`  
   (~8.2 days, last success ~2026-08-21). **No other job.** H4 dormancy (`IH35_QBO_JOB_HEALTH_ARMED` default off) is the intended clear. Re-arm QBO health only with that env `true`.
4. **Honesty Program** `docs/lockdown/HONESTY-PROGRAM-2026-08-29.md` — registry-driven, planted `--selftest`, fail-closed. **A posting path with no contract entry FAILS.**
5. **TXH-04** `docs/lockdown/TXH-04-COMPLETE-LINK-INVENTORY.md` — Cursor builds it. Owner saw invoice `L-20260828-0022` and factoring batch FAIL with empty ledger `✓ balanced`, missing truck/trailer, false Vendor ✕ on batch. Subscription-grade DoD: `docs/lockdown/SUBSCRIPTION-GRADE-DEFINITION-OF-DONE-2026-08-29.md`.
6. **SCEN-01** `docs/lockdown/SCEN-01-ACCIDENT-CHAIN-GO-2026-08-29.md` — CC-3 hops 1–3,5,7,10 **done** (cost line + liability 200 + claim/WO/legal/deduction). **CC-1 hops 4/6** (TMS bill + posted JE, **account codes** not `n>0`). Probe `scenario.accident` n=0 until those money hops. Several sittings.
7. Standing: `docs/lockdown/STANDING-ORDERS-CC-1-CC-2-CC-3-2026-08-29.md`. Queue 0055–0104 still underneath; **GO-0105 is NOW** and does not wait for 0104 chat.

---

## SEAT TABLE

| Seat | NOW | Forbidden |
|------|-----|-----------|
| **Cursor** | Lead. FAST-MERGE bus. **Build TXH-04 to the packet** (registry + evidence rewrite + ledger NOT POSTED + factor amounts + 12-hub guard). Deploy cadence when 5–10 PRs behind live. After deploy: full `/healthz` only. | No U14 restamp. No `gh pr checks --watch`. Do not stamp H4 confirmed from shallow. |
| **CC-1** | (1) SCEN-01 hops **4 + 6** + designed CoA codes. (2) H1 **live JE walk** vs `POSTING-CONTRACTS.json` roles. (3) H3 Sentry: DSN is **live green** (`sentry.heartbeat`) — next is **quota / rate limit / SDK init**, not missing DSN. (4) Rebase leftover **red** money PRs; never squash-merge red. URGENT-6 money surfaces if a hop is empty. | Never `trigger_deploy`. Do not steal TXH-04. Do not treat tracker `n>0` as posted-correctly. |
| **CC-2** | **H4: NOTHING TO CHASE** until post-deploy full healthz is still red with a **non-QBO** job name. Otherwise: GUARD live-verify after money merges; unique leftover 500/dead/silent; `prod_verified` only with live-binding packet. | Do not invent a second stale-job hunt. Do not recertify U14. Never `trigger_deploy`. |
| **CC-3** | **Customers next** — investigate live **LV-001 Relationship Health 500** (already flagged). Then remaining non-money backlog (compliance, driver-hub, program, form_425, users) **one FAIL at a time**, not a batch render-sweep. SCEN-01 create hops **closed** — do not remake. banking.json pre-existing FAIL = not your close. | No verify-steps. No migrations. No URGENT-6 money module “complete” stamps. Honesty H1–H5 not yours. |
| **Codex** | Unique leftover **dispatch / drivers / fleet / fuel** (500/dead/silent). Do not restamp CC-3’s clean module-completion waves. | No TXH-04. No GL. Never `trigger_deploy`. |
| **Cascade** | Unique **FINDING** on live healthz only. Append ledger. Skip #15546 #16895. Do not restamp SYS-S07 / U14. | No product PRs. No money stamps. |
| **Devin** | `/vendors` TEST + unique leftover. KEEP TEST. One Devin. | Do not steal `/customers` (CC-3 NOW). |
| **Devin-A** | **VOID.** Do not ACK. Do not work `/customers`. | Seat closed. |

---

## H1–H5 OWNERSHIP (do not wander)

| Block | Owner | Status |
|-------|--------|--------|
| H1 account-code contracts | CC-1 live walk | Registry + matcher on main. Live Neon JE vs roles **OPEN**. |
| H2 freshness | Cursor | Glob registry on main. |
| H3 Sentry | CC-1 | Heartbeat **green** (DSN present). Events dark = quota/SDK. |
| H4 background_jobs | Cursor code + CC-2 only if post-deploy still red | Dormancy on main `#17641`. Runbook `#17646`. Live proof **after deploy**. |
| H5 reversal | CC-1 after SCEN-01 reverse chains | Registry field present; producer `pending_scen01_chains`. |

---

## TXH-04 BUILD BAR (Cursor — do not ship chrome-only)

Packet: `docs/lockdown/TXH-04-COMPLETE-LINK-INVENTORY.md`

- Registry `docs/specs/system/TXH-LINK-INVENTORY.json` — 8 doc types × **12 hubs** each as required / optional / **explicit `not_applicable`**. Absent hub **FAILS**.
- Factoring **Vendor = not_applicable** (no FK). Show **Factor** + face/advance/fee amounts.
- Invoice **Load** from `source_load_id` (not n/a). Driver/Unit/Trailer **via Load**.
- Empty GL: **NOT POSTED** — never `✓ balanced` on zero lines.
- Guard `scripts/verify-txh-link-inventory-complete.mjs` + `--selftest` six plants. Wire via `money-pr-local-gate` and/or existing TXH verify-step **9895** runner (Rule 37: no new `NNNN-*.mjs` until claim on main).

---

## DEPLOY

Live API at GO send was often **`b2448ce`**. `origin/main` is ahead (includes H4). Cursor kicks when cadence allows. **SPA can lead API** — do not judge TXH/matrix until API SHA matches the code you claim.

---

## ACK SHAPE

`SEAT | ACK | GO-0105 | NOW=<one line from table> | SHA=<shallow version> | GO`
