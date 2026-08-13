# PASTE → CURSOR · CREATE-PATH TRIP WIRING

Canonical: `FINAL-CREATE-PATH-TRIP-WIRING-2026-08-12/00-README.md`  
Quality: Desktop `Claude.docx` / `docs/specs/OWNER-QUALITY-COMPACT.md`

## FORBIDDEN (distraction)
- Matrix Required inventory / scoreboard density as primary (#6290 CLOSED)
- Claiming trip linkage “done” from Required cells
- Wave D chrome as primary while create-path gaps remain
- Inventing load FKs on historical QBO rows

## DONE (do not redo)
- #6296 accident INSERT `$1…$6` + expense `suggestExpenseLoad` + guard 3128
- #6300 ClaimCreate `suggestExpenseLoad` + guard 3130

## NOW (non-stop) — ranked
1. **WO create** — submit `trailer_id` / `equipment_id` on `createWorkOrder` header (verify BE accepts); add trailer/equipment picker if missing; tires/reefer paths use same FKs.
2. Pass `trailer_id` into WO `suggest-load` query (API already accepts it).
3. After each merge: OUTBOX one line → next create-path FAIL (accident trailer FE once CC-1 lands schema; expense trailer picker once schema).
4. Bus: keep this FINAL packet + INBOXes current; 15m ping; sync `docs/bus/INBOX-*.md` → worktrees.

REPO: `/private/tmp/IH35-TMS-usmca-golive`  
OUTBOX: `Cursor | create-path=<id> | SHIPPED #N | NEXT=…`
