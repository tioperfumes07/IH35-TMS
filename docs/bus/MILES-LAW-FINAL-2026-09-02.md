# ALL SEATS — MILES LAW — SUPERSEDED FOR PAY FORMULA 2026-09-02 16:21 CT

**Pay formula, autofill-empty, and deadhead attribution:** use `docs/bus/MILES-SPEC-DISPATCH-FINAL-2026-09-02.md` (owner paste). This file's "extra miles = driver's problem" and "autofill empty as normal" rows are **STRUCK**.

Still true from this file: no mass-swap of `catalogs.lane_mileage`; Book Load flag + OK popup; do not block booking.

---

## STRUCK — do not execute

**SUPERSEDES #19740.** That bus said pay from practical + empty and forbade short miles. Owner overruled — **STRUCK**. Any INBOX still carrying it is stale.

---

## PAY LAW — NOT NEGOTIABLE

| Rule | Law |
|---|---|
| **Driver pay** | **STRUCK as a single number.** Two lines: shortest×rate_loaded + deadhead×rate_empty. See MILES-SPEC-DISPATCH-FINAL. |
| **Customer rate / RPM** | **PRACTICAL only** (loaded lane). |
| **Company cost** | **PRACTICAL + DEADHEAD** (never fold deadhead into practical). |
| **Driver overage** | **STRUCK** “extra miles = driver's problem.” Empty is paid on its own line. |
| **Empty vs practical** | **NEVER** fold deadhead into practical. NEVER autofill deadhead from the lane. |

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

Same column, **two meanings by row** — worse than a swap; no single transform fixes it:

- On ~2/3 of lanes (~2,047), `short_miles` holds **practical + deadhead** — historical operators entered "short" as whole trip incl empty.
- On the other **1,095 lanes**, `short_miles` means **shortest route** (correct semantics).

**Do NOT mass-swap** columns where `short > practical` — that would corrupt **1,095 lanes** that already have correct shortest-route semantics.

**Indy→Laredo proof:** practical 1319.7 + empty 207.6 = **1527.3** vs short **1478.1** (off ~49 ≈ avg gap).

---

## UX — OWNER (Book Load wizard)

1. **Autofill** practical / short / empty as normal — do not blank or block autofill.
2. **Flag** when untrustworthy — visible inline, not silent.
3. **Popup → OK → continue** — operator must press **OK** (no outside click, no Esc, no X-only close).
4. **Operator can edit** any field after OK.
5. **DO NOT BLOCK BOOKING.**

**Trigger flag when EITHER:**

- `short_miles > practical_miles` (column inversion), **OR**
- reverse-lane short differs by **> 100 miles** (direction-pair mismatch).

**CC-2 owns Book Load chrome** — popup + inline flag on `BookLoadModalV4`. CC-3 may assist on wizard shell sizing (J1) but does not own the popup.

---

## CC-1 — catalog remediation

CC-1 owns catalog fix — **no mass-swap**; PC*MILER not live; untrustworthy surfaces rather than quiet settlement feed.

Remediation must restore `short_miles` = shortest route. Jorge picks path — do NOT mass-transform without owner pick:

| Option | Description |
|---|---|
| **(a)** | PC*MILER recompute shortest route when live — owner decides scope/timing |
| **(b)** | Re-key inverted rows (operator or scripted re-entry of correct short) |
| **(c)** | Null/quarantine inverted shorts (flag rows where `short > practical`; operator types short at book) |

---

## URGENT — GO-22 settlements

GO-22 settlements will use **short miles**. Must **not** quietly pay on broken catalog. Flag untrustworthy short; do not silently auto-fill driver pay from corrupted catalog `short_miles`.

---

## Seat assignments

| Seat | Action |
|---|---|
| **CC-1** | Catalog remediation (a/b/c). No mass transform. Gate 0 purge continues in parallel. |
| **CC-2** | Book Load chrome: autofill + inline flag + OK-only popup. Chrome-prove 13508. |
| **CC-3** | Wizard shell sizing (J1) only — popup owned by CC-2. No lane_mileage mass correction. |
| **CODEX** | Costs tab: CPM = cost/(practical+empty). Driver pay = short miles (never practical). |
| **CURSOR** | Bus fan-out. Docs only this turn. |
| **CASCADE** | Live-query verify only. Never build. |

---

## Gate 0 unaffected

Purge, reseed **13557**, drop **B-** — all proceed. This finding does **not** block GO-26/27 Gate 0.

---

## References

- Load **13508** — owner real, Indianapolis→Laredo (the inverted lane).
- Ingest: `scripts/ops/seed-lane-mileage.mjs` (1:1 CSV mapping confirmed).
- `catalogs.lane_mileage` — `practical_miles`, `short_miles`, `empty_miles`, `source`.
- Prior doc (superseded for pay law): `docs/bus/MILES-INVERT-01-STOP-BEFORE-PAY-2026-09-02.md` — redirect here.
