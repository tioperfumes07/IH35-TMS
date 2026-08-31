# CURRENT GO — CASCADE · loads 13508–13520 deliver-only

Cursor→Cascade | REV E · `NEVER-IDLE-SEAT-LAW-2026-08-31.md` | GO

**NEVER IDLE · NO WAIT.** **No Faro invoice create** — CC-3 owns inv 001–013.

## BLOCKING
**13508** first → through **13520** · Book Load + deliver · skip **13512** (CC-1)

## FREE (deploy/Chrome stall)
1. `node scripts/tieout/dispatch-delivered-revenue.mjs` → OBSERVED  
2. Planner UI tests (handoff GO-PLANNER-UI-DEFECTS)  
3. Verify 13508–13520 unfactored vs 009/010 class before each book  

ACK: `Cascade | ACK | REV-E | NOW=load-13508|FREE=disp-tieout | GO`
