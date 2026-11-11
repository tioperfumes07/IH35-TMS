# ALL CODERS — OWNER ORDER — FULL BOARD-IDENTICAL BUILD (NOT SHELL, NOT OVER PREVIOUS)
Posted 11-11-2026 ~5:00 PM CT (2026-11-11 23:00Z) · Cursor seat relay of owner order · USMCA only

Owner, verbatim 11-11-2026 ~4:55 PM CT:

> "GET INSTRUCTIONS TO ALL CODERS, THAT THE DESIGN CHANGES THE PAGES TABS, MODULES, SUBTABS, ETC NOT JUST SHELL, FULL AND COMPLETE BUILD, EXACTLY AS THE DESIGN, NOT OVER PREVIOUS ETC."

This is the only current design-completion law for every seat. It supersedes any reading of "census / chrome / appearance / shell = done." It does not supersede seat-surface ownership, USMCA-only, engines-only, or the fast 4-minute merge law.

## WHO
CC-1 · CC-2 · CC-3 · Cursor · Cascade · Codex · Claude-Lead · every other coding seat on this bus.

Every seat reads `docs/bus/lead/` on every cycle. Do not wait for a messenger. Do not ask the owner to restate this.

## WHAT "DONE" MEANS (re-measurable)
A page, tab, module, or subtab is DONE only when **all** of the following are true against its governing design source (`docs/design/boards/**`, `docs/design/v3/*.dc.html`, `docs/design/approved-screens/**`, `docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md`):

1. **Exact structure** — every section, rail, KPI tile, filter, column, button, modal, drawer, form field, empty state, and print/export control shown in the design exists in the live route.
2. **Exact chrome** — type scale (11 / 12 / 22 only), control heights (34px / 40px edit), money never-ellipsis, nested-box law, Inter, `appearance="board"` where ParityTable mounts, multi-select entity filters (U12), gear column chooser where the board shows it.
3. **Full engine wiring** — every number, status, list, and action binds to its live API → Neon engine. No hardcoded board figures, no placeholders, no "coming soon," no dead buttons.
4. **Two-way links** — money cells, entity links, drawers, and Save/Close are wired; DECLARED_NO_DRILL only where the value truly has no source document.
5. **Replacement, not overlay** — the approved board **replaces** the prior composition. Do not stack the new board on top of the old screen. Do not leave legacy duplicate tables/filters/headers beside the board-identical surface. Delete or retire the superseded UI in the same PR that lands the board.

**NOT DONE:** shell-only restyle · census pass with missing elements · appearance token without engines · screenshot mood-match · "mostly" · previous screen kept underneath · other-seat surface touched without `SURFACE-BREACH-AUTHORIZED`.

## DO / DO NOT
**DO**
- Build your owned module's tabs and subtabs to the board, element by element, engines first.
- Fast-merge: local gate (plain + `--selftest` for every guard you touched) → push → `node scripts/fast-merge.mjs` → tip your OUTBOX (≤200).
- Leave other seats' surfaces alone unless the lead doc on this cycle names a breach line.

**DO NOT**
- Claim DONE from chrome-only or ParityTable appearance alone.
- Keep previous/legacy layouts "for now" next to the approved board.
- Invent missing mileage, money, or statuses.
- Touch match / Dreamline / TRANSPORTATION / TRUCKING / QuickBooks sync.
- Raise a baseline or author another seat's SURFACE-BREACH line.

## SEAT SURFACES (unchanged)
| Seat | Surface |
|---|---|
| Cursor | `pages/dispatch/**`, `components/dispatch/**`, `book-load.service.ts` + unowned FE |
| Cascade | `pages/reports/**` (R5 and report boards) |
| CC-1 | `pages/accounting/**` |
| CC-2 | `pages/banking/**` |
| Codex | `pages/maintenance/**` |
| CC-3 | `pages/safety/**` |

Unowned modules are shippable by any seat under this order; owned surfaces stay with their seat.

## DESIGN SOURCES (priority)
1. `docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md`
2. `docs/design/boards/{banking,driver-customers-vendors,maintenance,settlements}/**`
3. `docs/design/v3/*.dc.html` and `docs/design/approved-screens/**`
4. `docs/design/design-parity-contract.json` + `docs/design/ih35-design-tokens.css`

Do not build `*V2`, `*-PREVIOUS`, boards marked PREVIOUS, or superseded V3-Dispatch-LoadWizard (BookLoad owns that flow).

## REPORT
Tip your OUTBOX with: route/tab touched · design file · PR · sha · what was replaced (legacy removed) · live proof. Incomplete work stays OPEN / PARTIAL — never claimed built.

Standing law still binds: [HONEST-BUILT-LAUNCH-LAW](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed.
