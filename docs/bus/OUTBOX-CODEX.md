# CODEX — ROUND 8.5 / 8.11 / 8.12 — 2026-11-11

**INCOMPLETE: 0/45 boards fully certified.** Board identity includes every tab/subtab/modal, actual engine data, forward record drill and reverse/back navigation. Appearance-only changes are not completion. Production writes: 0.

## Ownership and handoffs

- CC-1: current request in INBOX-CC-1 for verify-orphan-surface-drill ORPH-004; existing exact handler regex rejects the tested CF3 setDate + setGrain("day") handler. Preserve assertions and plant missing date/day changes. Codex has not edited the owned guard.
- Cursor: current findings in INBOX-CURSOR. Driver picker changed stored HR-active eligibility to movement-active; test HR-active/no-movement. Timeline/DriverPlanner ignore shared entityFilters. Fresh live driver picker remained single-select; deployment acceptance unverified.
- Codex: Maintenance Home/In-Shop, Fleet Health Line/TruckProfile, nine maintenance board-set pages, then independent acceptance of other seats. Do not duplicate another seat's changes.

## Tested work and shipping state

| Item | Evidence | Actual status |
|---|---|---|
| CF3 Projected calendar query/day drill | Old2fail → new2pass; FE/BE tsc0; release0 at main66456a36a5; hooks-ON push b68fb56c9a | Not merged: affected CC-1 guard fails; branch codex/round85-projected-window |
| L3 Legal stage drill | Old5fail → new6pass; FE tsc0 | Local e6a00e2c34, not deployed |
| TP2/3 identity, links, DOT, PM, faults | Focused tests and FE tsc0; canonical source reads and paging | Local maintenance stack, not deployed |
| TP4 reefer hours/config | Backend16/16; reader/editor9/9; FE/BE tsc0 | Local7212a056e6, not deployed; no tractor-hours fallback |
| Truck SVG specimen-state removal | New SVG5/5, combined map15/15; old2fail; FE tsc0; independent review | Locale00779381d; full eight-system contract still OPEN |
| CA1 advance timestamps | Old3fail → new8pass; FE tsc0 | Local2cfb812b91, not deployed |
| Owning-seat inbox delivery | Docs-only branch codex/round812-coordination | Release exit1: factoring live guard connection failure; not pushed/merged |

## Current gates

Typography repaired by #28869/#28870; the former129→133 red is historical, not current.
CF3 prior release:247passed,2existing report-only findings,279skips (263live). Skips are not passes.
Coordination release:233passed,3failures,204skips; blocking verify-ldt-4-factoring-money could not connect. Two existing report-only money findings remain separate. No baseline, guard or hook bypass.
Coordination synced to mainfaa5669c33. Clean-main connection comparison/retry pending.

## Bounded live evidence, not full acceptance

- In Shop selected navigation #28726 30fa65871d observed correct. Full board OPEN.
- Fuel1440×900:8truck graphics/8spend bars; search8→1; clipped cells0. Missing model subtitles/generic graphics OPEN.
- Planner status union16→1→16 works; live driver single-select OPEN.
- Banking numeric clipping0; account names clipped7; Latest lines top981px. Full proportions/wiring OPEN.
- Accounting menu26px; lower panels465/465/388px at1440×900. Geometry only; full route/financial acceptance OPEN.
- Insurance H1 22px/700 vs locked600; full screenshot proof UNVERIFIED.
- TruckProfile eight-system source mapping: DVIR is not cab-item evidence; trailer brake/outer-tire source contracts unverified. Missing values must stay unknown, never specimen health.

## Next

Deliver inbox coordination with required green release, then CC-1 repair → CF3 retest/normal push/fast merge/deploy/live proof. Continue owned maintenance build from approved boards while blocked. Full45 census, visual diffs and clicked forward/reverse wiring are unfinished.

## Archive

[Earlier outbox, preserved](archive/OUTBOX-CODEX-archive-2026-11-11-before-round85-refresh.md).

> **Standing law:** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed.

