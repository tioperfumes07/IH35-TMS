# MILES-INVERT-01 — STOP-BEFORE-PAY
**Filed 2026-09-02 · Jorge + Claude · Root cause settled same day**
**UX ruling locked 2026-09-02 · Jorge · Book Load wizard autofill + flag + OK popup**

---

## Two meanings — do NOT confuse seats

These are **distinct defects**. Document both; treat separately in findings and remediation.

### 1. Column inversion (MILES-INVERT-01)

**Same lane, same direction** (Origin→Dest as stored) where `short_miles > practical_miles`.

- **2,142 / 3,237 lanes (66.2%)** on History catalog — NOT "wrong direction."
- Example: **Indianapolis→Laredo** is inverted; **Laredo→Indianapolis** on the same road is normal.
- Root cause: dual semantics on the `short_miles` column (see below). No single transform fixes all rows.

### 2. Direction pair mismatch (owner expectation — catalog quality)

**Opposite-direction pair** on the same lane (A→B vs B→A) should have **essentially the same loaded miles** (practical).

- Owner: *"Laredo→Chicago and Chicago→Laredo should be the same."*
- When the pair diverges wildly, that is also a **catalog quality defect** — show in finding.
- **CC-1 may compare pairs later** for remediation; do not mass-correct catalog without owner pick.

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
- Book Load wizard: still autofill all three fields; **flag** inversion; **OK-only popup** before operator continues.

---

## Owner UX — Book Load wizard (LOCKED 2026-09-02 · Jorge)

When catalog autofills miles and **`short_miles > practical_miles`** (column inversion) and/or **direction-pair mismatch** is detected:

1. **Still autofill** all three fields: practical / short / empty — do not blank or block autofill.
2. **Flag** the inversion (and pair mismatch if detected) on screen — visible inline, not silent.
3. Show a **popup** that explains the issue; operator must press **OK** to acknowledge — **cannot dismiss without OK** (no outside click, no Esc, no X-only close).
4. After **OK**, booking can continue with those values — operator may still edit any field.

**Driver pay law unchanged:** pay on **short miles** always; customer RPM on **practical**; company cost on **practical + empty**.

**CC-2 owns Book Load chrome** — popup + inline flag on `BookLoadModalV4`. CC-3 may assist on wizard shell sizing (J1) but does not own the popup.

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
3. **Until data fixed:** wizard autofill + flag + OK popup per Owner UX above; do not silently trust corrupted catalog short.
4. **Wizard must show** practical / short / empty on screen; flag inversion inline; OK popup before continue.

---

## Gate 0 unaffected

Purge, reseed **13557**, drop **B-** — all proceed. This finding does **not** block GO-26/27 Gate 0.

---

## Seat assignments

| Seat | Action |
|---|---|
| **CC-1** | Remediation options (a/b/c) restore short = shortest. Gate 0 purge continues in parallel. No mass transform. May compare direction pairs later. |
| **CC-2** | **Book Load chrome:** autofill + inline flag + OK-only popup when `short > practical` (and pair mismatch if detected). Chrome-prove 13508. Do not verify "short includes empty" copy. |
| **CC-3** | Wizard shell sizing (J1) only — popup owned by CC-2. No lane_mileage mass correction. |
| **CURSOR** | Bus fan-out done. Docs PR this turn; no FE unless trivial. |
| **CODEX** | Costs tab: CPM = cost/(practical+empty). Driver pay = short miles (never practical). Blocked on catalog short auto-fill until data fixed. |

---

## References

- Load **13508** — owner real, Indianapolis→Laredo (the inverted lane).
- Ingest: `scripts/ops/seed-lane-mileage.mjs` (1:1 CSV mapping confirmed).
- `docs/bus/GO-27-DISPATCH-ACCOUNTING-CRITICAL-PATH.md` — Gate 1.3 Chrome-prove miles.
- `catalogs.lane_mileage` — `practical_miles`, `short_miles`, `empty_miles`, `source`.
