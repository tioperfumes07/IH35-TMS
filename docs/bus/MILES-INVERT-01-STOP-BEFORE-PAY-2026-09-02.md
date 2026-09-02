# MILES-INVERT-01 — STOP-BEFORE-PAY
**Filed 2026-09-02 · Jorge + Claude · Cursor acknowledged error same day**

---

## Cursor correction (acknowledged)

MilesStrip/UI copy that **"short miles already include empty"** does **NOT** hold for Indianapolis→Laredo:

| Field | Miles |
|---|---|
| practical (loaded) | 1319.7 |
| empty (deadhead) | 207.6 |
| practical + empty | **1527.3** |
| short | **1478.1** |

1527.3 ≠ 1478.1 — the copy was wrong.

**Live catalog (USMCA, verified 2026-09-02):**

- **2,142 / 3,237 lanes (66.2%)** have `short_miles > practical_miles` — impossible if short is truly "shortest route."
- All affected rows: `source = History`.
- Same road **Laredo→Indianapolis** is normal; **Indianapolis→Laredo** is inverted.

Do **NOT** mass-swap columns where `short > practical` — that would corrupt **1,095 lanes** that are already correct if the hypothesis is wrong.

---

## Owner cost model (LOCKED everywhere)

| Metric | Formula | Notes |
|---|---|---|
| **Customer RPM** | `rate / practical_miles` | Loaded miles only. **NEVER** fold empty into practical. |
| **Company CPM** | `cost / (practical_miles + empty_miles)` | Deadhead is real cost. |
| **Empty miles** | Already on **2,398 lanes**, avg **251.9** | Wire into cost view; do not hide behind short. |

---

## STOP-BEFORE-PAY (all seats)

**Do NOT build any driver-pay-per-mile on `catalogs.lane_mileage.short_miles` until this finding is resolved.**

Until resolved, driver pay math = **`practical_miles + empty_miles` explicitly** — never `short_miles`.

---

## CC-1 owns finding — IN ORDER

1. **Read the ingest script** — swapped columns vs inconsistent historical entry? **Do not guess.**
2. **Do NOT mass-swap** where `short_miles > practical_miles` (corrupts 1,095 OK lanes if wrong).
3. **Until resolved:** driver pay = `practical_miles + deadhead/empty` **explicitly**, never `short_miles`.
4. **Wizard must show** practical / short / empty and **flag on screen when short > practical**.

---

## Gate 0 unaffected

Purge, reseed **13557**, drop **B-** — all proceed. This finding does **not** block GO-26/27 Gate 0.

---

## Seat assignments

| Seat | Action |
|---|---|
| **CC-1** | Own finding (steps 1–4 above). Gate 0 purge continues in parallel. |
| **CC-2** | Chrome-prove 13508 miles with flag visible. Do not verify "short includes empty" copy. |
| **CURSOR** | Bus fan-out done. Optional Gate 1 FE: wizard flag when `short > practical` (no pay math change). |
| **CODEX** | Costs tab: use practical + empty for CPM; never short for driver pay. Blocked on CC-1 resolution for pay-per-mile. |
| **CC-3** | No lane_mileage mass correction. |

---

## References

- Load **13508** — owner real, Indianapolis→Laredo (the inverted lane).
- `docs/bus/GO-27-DISPATCH-ACCOUNTING-CRITICAL-PATH.md` — Gate 1.3 Chrome-prove miles.
- `catalogs.lane_mileage` — `practical_miles`, `short_miles`, `empty_miles`, `source`.
