# CODEX — ROUND 8.5 / 8.10 — 2026-11-11

**INCOMPLETE: 0/45 boards have full element-by-element live acceptance.** Source/table appearance scans are not proof of full wiring. USMCA read-only; production data writes0. Existing workflows are preserved, not covered by replacement shells.

## Merged and bounded live acceptance

- In Shop selected navigation: #28726 `30fa65871d`, independently observed In Shop current and Fleet Table not current. Subsequent breadcrumb recheck captured privately. Not complete-board certification.
- Cursor #28836 `c5c83d2955` and #28837 `2ffddba89b` present on main; no blanket live acceptance. Off-scale typography now0; residual raw-size ratchet below remains red.

## Local repairs awaiting green release

| Finding | Local evidence | Status |
|---|---|---|
| CF3 Projected date window | Old2 failures → new2 passing mounted tests; TypeScript0; independent review clean | codex/round85-projected-window; synced main; not pushed/deployed |
| L3 Legal stage drill | Old5 failures → new6 passing tests; URL scope preserved through modals; TypeScript0 | Local e6a00e2c34; not deployed |
| TP2/TP3 truck identity, links, DOT, PM and faults | 22 tests PASS; actual unresolved-fault read and server paging; TypeScript0 | Local stack through d24470bbf8; not deployed |
| TP4 reefer hours source | 16 backend +26 frontend tests PASS; reader/editor9 PASS; FE/BE TypeScript0; independent review clean | Local7212a056e6; own attached reefer hours/config, no tractor fallback; not deployed |
| CA1 advance timestamps | Old3 failures → new8 passing tests; TypeScript0 | Local; not deployed |

## Current measured release blocker

`verify-ui-design-system-ratchet` exits1 on branch and isolated clean main d726eac1a6: `raw_font_sizes:129→133 (+4)`. The previous eight off-scale sizes are fixed, not this raw-size growth. Full preflight did not start after failing prerequisite. No baseline increase or hook bypass. Cursor/Lead notified via private Lead channel `2026-11-11-CODEX-BOOKLOAD-RESIDUAL-GATE.md`.

## Live observations retained, not overclaimed

- Fuel fresh11-11live at1440x900:8truck SVGs and8spend bars, zero clipped cells; search8→1. Missing make/model and source-hardcoded generic aero graphic remain; not whole-board acceptance.
- Planner status multi-select live16rows→1(In Use)→16(In Use+Available), union verified. Driver still single All drivers combobox on fresh live page; #28836 not live accepted.
- Insurance DOM1440×900: approved subtitle/footer present, premium links not clipped; policy drill opens assigned-unit/related sections. H1 computed22px/700 versus locked600. Screenshot timeout: visual acceptance UNVERIFIED.
- Load History footer money wraps; unidentified settlement label remains clickable. Reported to Cursor; no invented display IDs.
- Accounting A1/A2 geometry rechecked live: menubar26px; lower panels465/465/388px at1440x900. Bounded geometry fixed; full wiring/financial acceptance still OPEN.
- TP1 full eight-system map OPEN. Report/route map and private screenshots retain other findings; no whole-board zero-failure claim.

Exact remaining raw-size delta versus pre-#28796: BookLoadModalV4 26→29 (+3), DispatchPlannersLayout0→1 (+1). Both assigned Cursor. Reference extraction now covers45source files /7830candidate text+graphic nodes, conditional/example values explicitly not live proof; private review artifact in Downloads. Manual grouping and exhaustive live checks remain unfinished.

## Next

Independent source review found a new driver-picker eligibility regression and unwired shared planner filters; details and live Banking/Fuel measurements: [Cursor repair handoff](lead/11-11-2026-CODEX-ROUND85-CURSOR-REVERIFY-FUEL-PLANNERS.md). Focused9tests PASS does not cover those gaps. Banking money clipping now0; account truncation7 and Latest lines y981 remain.

Re-measure typography gate, then required release0 → normal push hooksON → fast merge → deploy proof for CF3. Continue live verification of #28810–#28833 and U12 per ROUND8.10; no edits to another seat's surface. Full45 census/diffs and wiring proof unfinished.

## Archive

[Earlier outbox, preserved](archive/OUTBOX-CODEX-archive-2026-11-11-before-round85-refresh.md).

> **Standing law:** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed.
