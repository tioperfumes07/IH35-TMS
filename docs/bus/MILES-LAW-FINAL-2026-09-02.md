# ALL SEATS — MILES LAW, CORRECTED AND FINAL — 2026-09-02

**SUPERSEDES #19740.** That bus said pay from practical + empty and forbade short miles. Owner overruled — **STRUCK**. Any INBOX still carrying it is stale.

---

## PAY LAW — NOT NEGOTIABLE

| Rule | Law |
|---|---|
| **Driver pay** | **SHORT MILES, ALWAYS.** Never practical. |
| **Customer rate / RPM** | **PRACTICAL only** (loaded lane). |
| **Company cost** | **PRACTICAL + EMPTY** (deadhead is real cost). |
| **Driver overage** | Extra miles beyond short = **driver's problem**. |
| **Empty vs practical** | **NEVER** fold empty into practical. |

---

## MILES-INVERT-01 — catalog short untrustworthy

Live numbers (Jorge, USMCA, 2026-09-02):

| Stat | Value |
|---|---|
| Inverted lanes (`short > practical`) | **2,142 / 3,237 (66.2%)** |
| All affected rows | `source = History` |
| avg(short − practical) | **224.7** |
| avg(empty_miles) | **269.2** |
| avg(short − practical − empty) | **−44.5** (gap IS deadhead) |
| Directional pair test (352 pairs) | practical avg gap **29.4** vs short **174.8** |

**Root cause is NOT a column swap.** Ingest `scripts/ops/seed-lane-mileage.mjs` maps CSV → column **1:1** — no swap. Data arrived that way from historical operators.

**Do NOT mass-swap** columns where `short > practical` — that would corrupt **1,095 lanes** that already have correct shortest-route semantics.

---

## UX — OWNER (Book Load wizard)

Autofill · Flag when untrustworthy · Popup → OK → continue · Operator can edit · **DO NOT BLOCK BOOKING.**

Trigger when **short > practical** OR reverse-lane short differs by **> 100 miles**.

---

## URGENT — GO-22 settlements

GO-22 settlements will use **short miles**. Must **not** quietly pay on broken catalog.

---

## CC-1 remediation — restore short = shortest

**PC*MILER not live.** Jorge picks path — do NOT mass-transform without owner pick:

| Option | Description |
|---|---|
| **(a)** | PC*MILER recompute shortest route when live — owner decides scope/timing |
| **(b)** | Re-key inverted rows (operator or scripted re-entry of correct short) |
| **(c)** | Null/quarantine inverted shorts (flag rows where `short > practical`; operator types short at book) |

---

## Seat assignments

| Seat | Action |
|---|---|
| **CC-1** | Remediation options (a/b/c); Gate 0 purge in parallel; no mass transform; may compare direction pairs later. |
| **CC-2** | Book Load chrome: autofill + inline flag + OK-only popup when triggers fire; Chrome-prove 13508. |
| **CC-3** | Wizard shell sizing (J1) only — popup owned by CC-2. |
| **CURSOR** | Bus fan-out; docs canonical. |
| **CODEX** | Costs tab: CPM = cost/(practical+empty); driver pay = short miles. |
| **CASCADE** | FINDINGS only. Never build. |

---

## References

- Load **13508** — Indianapolis→Laredo (inverted lane).
- Ingest: `scripts/ops/seed-lane-mileage.mjs` (1:1 CSV mapping confirmed).
- `catalogs.lane_mileage` — `practical_miles`, `short_miles`, `empty_miles`, `source`.

