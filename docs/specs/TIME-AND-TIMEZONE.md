# TIME & TIMEZONE — system-wide locked rule

**Status: LOCKED (Jorge, 2026-06-19). Enforced by CI `scripts/verify-timezone.mjs`.**

> **SUPERSEDES rule G1.** This corrects rule **G1 in `IH35-TMS-MASTER-RULES.md`**, which states *"Central Time
> (UTC-5)"* — that fixed offset is **wrong**: Central is **UTC-6 standard / UTC-5 DST**. The home-terminal zone is
> **`America/Chicago` (IANA), DST-aware, never a fixed offset.** Any code or doc citing "UTC-5"/"UTC-6" as a constant
> for Central time is a bug to fix. (The stale G1 wording kept re-seeding the fixed-offset error.)

Every wall-clock time, day boundary, projection, ETA, accounting period, and HOS clock in this system must be
**timezone-correct and DST-correct**. Getting this wrong is a financial- and legal-evidence defect (HOS is a DOT
safety record; settlements and IFTA are money/tax). This file is the durable law; the CI guard is the teeth.

## The three rules

1. **Store UTC.** Every persisted instant is `timestamptz` (UTC). Never store a naive local time.
2. **Compute with IANA zones — never fixed offsets.** All day-boundary / calendar math uses **Luxon**
   (`luxon`, already a dependency) with a named IANA zone (`America/Chicago`, …). A Central day is **23h or 25h**
   on DST-change dates — fixed `24 * 3600_000` day stepping, `getTimezoneOffset()`, hardcoded `-6`/`-5` offsets,
   and `"-06:00"` literals are **forbidden** in time math. Use `DateTime.fromISO(d, { zone }).startOf("day")`,
   `.plus({ days })`, `.setZone(zone)`.
3. **Display labeled with its zone.** Every rendered time shows its zone (e.g. `15:25 CT`). Never show a bare
   wall-clock with an ambiguous zone.

## HOS law (non-negotiable, FMCSA)

The HOS **24-hour period and the 7/8-day cycle are anchored to the HOME TERMINAL time zone**, regardless of where
the truck physically is. Home terminal = **`America/Chicago` (Laredo)** for TRANSP today; it is **per operating
company** (a future `org.companies.home_terminal_tz` config — until then the constant is correct for the live entity).

- `eight_day_breakdown` buckets on-duty minutes by **home-terminal CALENDAR DAYS** (today + prior 7), **DST-aware**.
  A breakdown day's maximum is its **actual length** (1380 min on a 23h spring-forward day, 1500 min on a 25h
  fall-back day) — NOT a fixed 1440. The "impossible day" sanity check compares against the real day length.
- Samsara timestamps are **UTC**; convert to home-terminal Central for all bucketing and display, consistently.

### Clock source (OPEN — pending Jorge, see Blueprint §3.15.9.2 / §3.15.8.3)
The four legal clocks (drive/shift/cycle/break remaining) + violation flag SHOULD come from **Samsara's computed
values** (`GET /fleet/hos/clocks`) and be **displayed verbatim** (DOT-certified, board==roster by construction),
stored per §3.15.8.3 in `samsara.hos_snapshots`. We currently **recompute** them from `/fleet/hos/logs` — that
recompute is the source of the divergence/coherence/window/DST risk for the *numbers*. The recompute-from-events
path is retained ONLY for the **visual ELD timeline** + the **8-day breakdown bars** (Samsara doesn't return those).

## Per-surface list (every surface that does time/day math)

| Surface | Zone anchor | Notes |
|---|---|---|
| HOS clocks (drive/shift/cycle/break) + violation | home terminal (Central) | verbatim-from-Samsara pending; else recompute |
| HOS 8-day cycle breakdown bars | home-terminal **calendar days**, DST-aware | Luxon `startOf("day")`, per-day-length cap |
| HOS ELD timeline (24h track) | home-terminal day | `getHosDaily` segments |
| `captured_at_local` (board + dispatch live location) | home terminal (Central) | label `CT` |
| Dispatch ETAs / predicted delivery | **destination-local** | the receiver's zone, not Central |
| Detention / appointment windows | **facility-local** | the stop's zone |
| IFTA | jurisdiction day boundaries | quarter close by state |
| Driver settlements / period close | accounting period (carrier) | period boundaries in carrier zone |
| Driver-inactivity cutoff (Block 10) | home-terminal calendar days | the ~21-day cutoff evaluated in Central days |
| Daily Tasks / calendar day-strips | home terminal | "today" = Central today |

## CI guard (`scripts/verify-timezone.mjs`)
Fails the build on: fixed-offset literals / `getTimezoneOffset()` / naive day-boundary arithmetic in
telematics/HOS/accounting time paths, and HOS day-bucketing not anchored to the home-terminal IANA zone.
