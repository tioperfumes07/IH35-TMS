# NOW-CURSOR — 2026-09-29 ROUND 224 DONE

## HARD LINE
ROUND 219 freeze held except AUTH-126 Check Creator chain. Factoring STOPPED.
LIVE-DB guards: re-run WITH master-keys DATABASE_URL before blaming code (ROUND 29.9-B).

## ROUND 224 — CHECK CREATOR MOUNTED + AUTH-126 CONSUMED — DONE

### Defect
`registerCheckRoutes` had ZERO named callers outside its folder. Autoload fp was not
acceptable as the greppable mount. FE CheckDetail/Print already in manifest.

### Fix (merged #23117 squash `2661b67017`)
- `index.ts`: import + `await registerCheckRoutes(app)`
- `accounting/index.ts`: ignore `checks.routes` (no double-mount)
- Named-export only (no `export default fp`) — cash-flow pattern
- Guard `verify-check-routes-mounted.mjs` PASS

### AUTH-126 chain (2026-09-29T17:00Z)
BEFORE reg=4 live=0 next=1005
→ createCheck 4194581a… need_to_print JE 06628a5e… posted
→ print_batch 3b8a40aa… check#1005 print_complete
→ void rev JE 2f774a6c…
AFTER reg=5 live=0 next=1006

### 3+4 accounting
1001–1005 all voided seat/AUTH proofs. Live check expenses = 0.

## DO NOT
- Leave a live unvoided check in USMCA
- Double-register checks.routes via autoload + index (boot crash)
- Steal CC-2 opening-balance / escrow
