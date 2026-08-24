# PASTE ALL SEATS — GO NOW (2026-08-24 16:36 CT)

**You are not blocked on Cursor merge.** Keep working. Idle = defect.

## Honest bar (do not lie to Jorge)

**#15601 is NOT Fully-Wired items 1–12** for Program / Dispatch / Customers / Print.
It is **leftover unique** routing + create + SPA-print steal.

| Finding | Merged on `main`? | Live `427f8ca` yet? | Fully-Wired 1–12? |
|---|---|---|---|
| PROGRAM-TRACKER-F07 book-load + hop hrefs | YES #15601 `b429ce00` | **NO** — healthz still `427f8ca` | **NO** — hop/route only |
| COMPLICATED-BATTERY-F08 in-transit href | YES (same PR) | NO until next deploy | **NO** — card href + tab parse |
| COMPLICATED-PRINT-F09 `/api/*` SPA steal | YES (same PR) | NO until next deploy | **NO** — passthrough only; letter HTML must still exist on API |
| CUSTOMER-CREATE-DEAD-CLICK | YES (same PR, z-50 + `?create=1`) | NO until next deploy | **NO** — create door only |
| Program STALE `accounting.bills` | **NO** — API/DB probe | live now | not a chrome hop |
| Spine fire-and-forget invoice events | **NO** — next Cursor PR | — | money emit path |

U14 stays **14/14 CERTIFIED. Never restamp.**

## What every seat does THIS MINUTE

1. `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow` → record `version`.
2. **Do not wait for deploy.** On **current** SHA: CREATE labeled TEST, name UUID + table + JE. Empty TMS is expected.
3. When `version` ≠ `427f8ca` (expect ancestor of `b429ce00` / later): **hard reload**, re-walk hop.book + +Create Customer + breakdown card + invoice `.html` on **API host**.
4. File **unique** FINDING only (500 / dead click / silent no-op / reverse-empty / fake $0 / save with no JE). No product PRs from Cascade/Devin-A.
5. CC never `trigger_deploy`. Cursor deploys 5–10 min **AND** 5–10 PRs, one in-flight.

## Seat NOW (parallel — do not serialize on Cursor)

| Seat | Port | NOW | OUTBOX |
|---|---|---|---|
| **CC-1** | 9223 | Hops 6–9 + roadside bill + invoice/proforma letter. Prove `accounting.bills` + JE. If tracker STALE on bills, FINDING with probe error — do not idle. | `CC-1 \| ACK \| PROGRAM-SCENARIO-PROOF \| PORT=9223 \| SHA= \| HOP=hop.invoice \| TABLE= \| UUID= \| JE= \| FINDING= \| GO` |
| **CC-2** | 9224 | `/reports` `/cash-flow` `/tasks` **read the same TEST dollars**. No second fake $0. | `CC-2 \| ACK \| …` |
| **CC-3** | 9225 | `/program` + matrix lists/legal + `scenario.legal`. CREATE TEST if empty. | `CC-3 \| ACK \| …` |
| **Codex** | 9226 | Hops 2–5 + driver/unit/fuel/safety/WO on the **same** TEST load family. | `Codex \| ACK \| …` |
| **Cascade** | audit | Walk hops 1–9 + battery. FINDING if still stub/misroute **on the SHA you curled**. No product PR. | `Cascade \| ACK \| …` |
| **Devin-A** | audit | `/program` → hop.book → `/customers` CREATE TEST. FINDING if create still dead **on that SHA**. Not PARKED. | `Devin-A \| ACK \| …` |
| **Cursor** | 9222 | Next unique: spine `await` emit + deploy cadence when 5–10 PRs/min gate allows. Not a seat blocker. | — |

**QBO + TRANSP/TRK stay OFF. Posting LIVE on USMCA. Missing JE after save = FINDING.**
