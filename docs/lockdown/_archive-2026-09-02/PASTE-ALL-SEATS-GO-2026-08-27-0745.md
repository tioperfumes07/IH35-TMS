# GO-0745 — GREP-VERIFIED 7D DRAIN · NEVER PATCH · 2026-08-27 07:45 CT

**THIS IS NOW.** Live **`0340406`**. Hard-reload. Skip #15546. Nobody `trigger_deploy`.

**Law:** root cause + canonical write + mutation-proven guard + live re-prove. **No patch. No defer. No “FIXED because 200.”** Board stamp without main code = still OPEN.

ACK: `SEAT | ACK | GO-0745 | NOW=<id> | SHA=0340406 | GO`

Ping ≠ ACK. Grep `origin/main` before remake. Jorge is not the messenger.

---

## Cascade 7d (`OUTBOX-CASCADE` 7D-LEDGER + Cursor grep @ `5add150`)

Cascade said: FIXED=3 · OPEN=3 · ARCH=1. **Grep vs that:**

| ID | Cascade | Main code | Complete-fix owner NOW |
|----|---------|-----------|------------------------|
| COMMODITY PATCH 500 | FIXED | #16616 on main | Cascade re-prove only |
| BORDER-WAIT-TIMES-RLS-500 | FIXED live 200 | `cbp-wait-times.service.ts` still **INSERT** with no lucia/SECURITY DEFINER | **CC-1** wrap the cache write. Hiding 500 / lucky cache hit = patch |
| DRIVER-LABEL | API “works” | `resolve_driver_label_same_company` **absent**. FE still “Driver — not visible” | **CC-1** resolver function. **CC-3** list consume (not a string fallback) |
| STATUS-FILTER-400 | OPEN | still FE/API enum mismatch | **CC-3** map + fail-loud. Not a toast |
| TRIP-PAIRING-EXPENSES-404 | OPEN | `TripPairingBoardPage` uses `getTripPairingBoard` only — ghost `/api/v1/accounting/expenses` **gone** | **CC-3** ratchet + live prove. Do **not** invent `/accounting/expenses` GET |
| COMMODITY CREATE silent no-op | ARCH | `book-load.service.ts` still accepts `commodity`/`weight_lbs` and does not persist | **CC-1** persist **or** remove UI+schema end-to-end |
| HOS RetryRetryRetry | Cascade: concat FIXED | still prove on `0340406` | **CC-3** if concat returns |

---

## Devin `/vendors` 7d

Deactivate / Reactivate / SAFER: **FIXED class** — re-prove on `0340406`. TEST `63a9a2d1`.

`HEADER-CREATE-BUTTON-DEAD-CLICK`: Topbar **has** `onClick` + `global-create-menu` on main. CC-3 CND on `f12ab6e`. **Do not remake.** Unique vendor FINDING only.

---

## Codex 7d

**Codex NOW:** unique drivers/fleet/safety **complete** verticals. Never restamp U14. Never remake #16629 money.

**CC-1 serial (complete, not route-only):** INS-MONEY-F6843A · MAINT-MONEY-F6803A · MAINT-MONEY-F6797 (void-not-delete). **MAINT-MONEY-F6788A** stays owner-gated — do **not** build the parts-inventory-credit comment.

**Cursor this hop:** SAFETY-GUARD-F6851A (immutable `input.draft.subject_unit_id`). **Codex:** GUARD-F6809A parser if still red.

---

CC-1 last STATUS “no CC-1 rows” is **false**. Start wait-times wrap + driver resolver. Idle = defect.
