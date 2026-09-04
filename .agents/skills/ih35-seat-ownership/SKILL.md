---
name: ih35-seat-ownership
description: Owner-defined seat ownership map as of 2026-09-03. Load alongside current AGENTS.md / 00-IH35-LAW.mdc and claude/GO-23; in conflicts prefer the newer file or the live GO-23 assignment.
---

# ih35-seat-ownership

**Source:** auto-generated Cascade memory `3b850332-2248-40d3-ac0a-baff64ad97e7`.

Owner-defined seat ownership and laws as of 2026-09-03:

- **CURSOR:** Book Load wizard — design, fields, validation, miles UI, charge lines, POST.
- **CASCADE:** Dispatch board + Round Trips timeline + every list/table view. Owns `/apps/frontend/src/pages/lists/**` and `/apps/frontend/src/pages/reports/**` and `DispatchBoard`/`RoundTripsTimeline`/`ParityTable`/design tokens. No money. No Chrome. No booking loads.
- **CC-1:** Load costs → pre-settlement → settlement + mileage engine + lane table. Owns round-trip data and money.
- **CC-2:** Banking + accounting — match, expenses, bills, invoices, GL, QBO.
- **CC-3:** Drivers + compliance — roster, licences, HOS, qualification.
- **CODEX:** Fleet — units, trailers, maintenance, work orders, OOS, vehicle swap.

## Laws

- No seat opens Chrome / books a load.
- One seat owns one module end to end including money; never edit another seat's file — file a finding to owner.
- Never idle; each seat has numbered standing queue; finish item then open next.
- CC-1 owns mileage engine; Cascade only consumes it. CC-1 owns round-trip data/money; Cascade owns the view. Codex owns vehicle-swap catalog; CC-1 owns cost split.
- Dispatch board moved from Cursor to Cascade.
- USMCA only; TRANSP/TRUCKING frozen.

## Current status / conflicts to reconcile

- `00-IH35-LAW.mdc` (2026-09-02) lists seats as: CC-1 money · CC-2 design-system transcription + verify-live · CC-3 mechanical · Cascade merge API · Codex reverse/CI · Devin-A RETIRED · **Cursor is lead**. `AGENTS.md` §PERMANENT LAW repeats this.
- `claude/GO-23-BUILD-SEQUENCE-STRICT-2026-09-02.md` assigns many UI/list/board tasks to CC-3 and design-system verification to CC-2.
- This memory is dated 2026-09-03 but conflicts with the 2026-09-02 canonical files on CC-2 (banking/accounting vs design-system) and on which seat owns lists/boards. When in conflict, verify with the owner; prefer the file dated later or the live GO-23 assignment.
