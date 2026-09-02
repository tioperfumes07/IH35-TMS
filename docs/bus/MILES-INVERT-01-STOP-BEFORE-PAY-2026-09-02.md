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

## Owner law — driver pay + cost model (LOCKED 2026-09-02 · Jorge ruling supersedes interim advice)

| Rule | Law |
|---|---|
| **Driver pay basis** | **ALWAYS `short_miles`. NEVER practical.** Pay-per-mile uses shortest route only. |
| **Driver overage** | If the driver drives more than short, that is the **driver's problem** — not company pay. |
| **Customer RPM** | `rate / practical_miles` | Loaded miles only. **NEVER** fold empty into practical. |
| **Company CPM** | `cost / (practical_miles + empty_miles)` | Deadhead is **company cost**, not driver pay. |
| **Empty miles** | Already on **2,398 lanes**, avg **251.9** | Wire into cost view; do not hide behind short. |
| **Practical miles** | Customer rate / RPM only. **Not** driver pay. |

**Do NOT change product law to pay on practical+empty.** Fix the data so `short_miles` means shortest route again.

---

## STOP-BEFORE-PAY (all seats)

**`short_miles` is untrustworthy on 66% of History lanes** (often a practical+deadhead artifact). Therefore:

**STOP auto-paying from catalog `short_miles` until inverted shorts are corrected or replaced.**

- Do **NOT** auto-fill driver pay miles from catalog `short_miles` while corrupted rows remain.
- The **definition** of pay basis remains **short miles** — not practical, not practical+empty.
- **Wizard must flag** when `short > practical` and **require operator confirm/override** with a typed short before pay miles lock.

---

## CC-1 owns finding — ingest confirmed, remediation restores short = shortest

**Ingest read (confirmed):** `scripts/ops/seed-lane-mileage.mjs` lines 148–186 — CSV `practical_miles` → `practical_miles`, `short_miles` → `short_miles`, `empty_miles` → `empty_miles`. No column swap. Data arrived with dual semantics.

**Remediation must restore `short_miles` = shortest route. Jorge picks path — do NOT mass-transform without owner pick:**

| Option | Description |
|---|---|
| **(a)** | PC*MILER recompute shortest route when live — owner decides scope/timing |
| **(b)** | Re-key inverted rows (operator or scripted re-entry of correct short) |
| **(c)** | Null/quarantine inverted shorts (flag rows where `short > practical`; operator types short at book) |

**Still locked regardless of option picked:**

1. **Do NOT mass-swap** where `short_miles > practical_miles`.
2. **Driver pay = `short_miles` always** — never practical, never practical+empty.
3. **Until data fixed:** do **NOT** auto-fill pay from catalog short; wizard flags `short > practical` and requires operator confirm/override typed short.
4. **Wizard must show** practical / short / empty on screen.

---

## Gate 0 unaffected

Purge, reseed **13557**, drop **B-** — all proceed. This finding does **not** block GO-26/27 Gate 0.

---

## Seat assignments

| Seat | Action |
|---|---|
| **CC-1** | Remediation options (a/b/c) restore short = shortest. Gate 0 purge continues in parallel. No mass transform. |
| **CC-2** | Chrome-prove 13508 miles with flag visible. Do not verify "short includes empty" copy. |
| **CURSOR** | Bus fan-out done. Optional Gate 1 FE: wizard flag + operator confirm when `short > practical`. |
| **CODEX** | Costs tab: CPM = cost/(practical+empty). Driver pay = short miles (never practical). Blocked on catalog short auto-fill until data fixed. |
| **CC-3** | No lane_mileage mass correction. |

---

## References

- Load **13508** — owner real, Indianapolis→Laredo (the inverted lane).
- Ingest: `scripts/ops/seed-lane-mileage.mjs` (1:1 CSV mapping confirmed).
- `docs/bus/GO-27-DISPATCH-ACCOUNTING-CRITICAL-PATH.md` — Gate 1.3 Chrome-prove miles.
- `catalogs.lane_mileage` — `practical_miles`, `short_miles`, `empty_miles`, `source`.
