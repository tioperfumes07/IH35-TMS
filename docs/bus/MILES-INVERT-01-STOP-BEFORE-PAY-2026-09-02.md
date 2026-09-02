# MILES-INVERT-01 — STOP-BEFORE-PAY
**Filed 2026-09-02 · Jorge + Claude · Root cause settled same day**

---

## Settled root cause (NOT a column swap)

Ingest `scripts/ops/seed-lane-mileage.mjs` maps CSV → column **1:1** — no swap. Data arrived that way from historical operators.

**Across 2,142 inverted lanes (`short_miles > practical_miles`):**

| Stat | Value |
|---|---|
| avg(short − practical) | **224.7** |
| avg(empty_miles) | **269.2** |
| avg(short − practical − empty) | **−44.5** ← gap IS the deadhead |
| empty_miles > 0 | **2,135 / 2,142** |
| short_min > practical_max | **2,015 / 2,142** (systematic) |

**Same column, two meanings by row — worse than a swap; no single transform fixes it.**

- On ~2/3 of lanes (~2,047), `short_miles` holds **practical + deadhead** — historical operators entered "short" as whole trip incl empty.
- On the other **1,095 lanes**, `short_miles` means **shortest route** (correct semantics).
- Neither interpretation is safe for driver pay without row-level resolution.

**Indy→Laredo proof:**

| Field | Miles |
|---|---|
| practical (loaded) | 1319.7 |
| empty (deadhead) | 207.6 |
| practical + empty | **1527.3** |
| short | **1478.1** |
| 1319.7 + 207.6 | 1527.3 vs short 1478.1 (off ~49 ≈ −44.5 avg gap) |

**Cursor half-right:** "short includes empty" is true on the inverted majority **as artifact**, false on the other third. Neither is safe for driver pay.

**Live catalog (USMCA, verified 2026-09-02):**

- **2,142 / 3,237 lanes (66.2%)** have `short_miles > practical_miles`.
- All affected rows: `source = History`.
- Same road **Laredo→Indianapolis** is normal; **Indianapolis→Laredo** is inverted.

Do **NOT** mass-swap columns where `short > practical` — that would corrupt **1,095 lanes** that already have correct shortest-route semantics.

---

## Owner cost model (LOCKED everywhere)

| Metric | Formula | Notes |
|---|---|---|
| **Customer RPM** | `rate / practical_miles` | Loaded miles only. **NEVER** fold empty into practical. |
| **Company CPM** | `cost / (practical_miles + empty_miles)` | Deadhead is real cost. |
| **Empty miles** | Already on **2,398 lanes**, avg **251.9** | Wire into cost view; do not hide behind short. |

---

## STOP-BEFORE-PAY (all seats)

**Do NOT build any driver-pay-per-mile on `catalogs.lane_mileage.short_miles` until Jorge picks a remediation path.**

Until resolved, driver pay math = **`practical_miles + empty_miles` explicitly** — never `short_miles`.

---

## CC-1 owns finding — ingest confirmed, next step is owner pick

**Ingest read (confirmed):** `scripts/ops/seed-lane-mileage.mjs` lines 148–186 — CSV `practical_miles` → `practical_miles`, `short_miles` → `short_miles`, `empty_miles` → `empty_miles`. No column swap. Data arrived with dual semantics.

**Propose remediation options for Jorge — do NOT mass-transform without owner pick:**

| Option | Description |
|---|---|
| **(a)** | Deprecate `short_miles` for pay; use `practical + empty` explicitly everywhere |
| **(b)** | Null/quarantine inverted shorts (flag rows where `short > practical`) |
| **(c)** | PC*MILER recompute when live — owner decides scope/timing |

**Still locked regardless of option picked:**

1. **Do NOT mass-swap** where `short_miles > practical_miles`.
2. **Until resolved:** driver pay = `practical_miles + empty_miles` **explicitly**, never `short_miles`.
3. **Wizard must show** practical / short / empty and **flag on screen when short > practical**.

---

## Gate 0 unaffected

Purge, reseed **13557**, drop **B-** — all proceed. This finding does **not** block GO-26/27 Gate 0.

---

## Seat assignments

| Seat | Action |
|---|---|
| **CC-1** | Propose remediation options (a/b/c) for Jorge. Gate 0 purge continues in parallel. No mass transform. |
| **CC-2** | Chrome-prove 13508 miles with flag visible. Do not verify "short includes empty" copy. |
| **CURSOR** | Bus fan-out done. Optional Gate 1 FE: wizard flag when `short > practical` (no pay math change). |
| **CODEX** | Costs tab: use practical + empty for CPM; never short for driver pay. Blocked on Jorge pick for pay-per-mile. |
| **CC-3** | No lane_mileage mass correction. |

---

## References

- Load **13508** — owner real, Indianapolis→Laredo (the inverted lane).
- Ingest: `scripts/ops/seed-lane-mileage.mjs` (1:1 CSV mapping confirmed).
- `docs/bus/GO-27-DISPATCH-ACCOUNTING-CRITICAL-PATH.md` — Gate 1.3 Chrome-prove miles.
- `catalogs.lane_mileage` — `practical_miles`, `short_miles`, `empty_miles`, `source`.
