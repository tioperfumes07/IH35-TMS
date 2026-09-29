# NOW-CURSOR — 2026-09-29 ROUND 224

## HARD LINE
ROUND 219 freeze held except AUTH-126 Check Creator chain. Factoring STOPPED.
LIVE-DB guards: re-run WITH master-keys DATABASE_URL before blaming code (ROUND 29.9-B).

## ROUND 224 — CHECK CREATOR NEVER WIRED — IN FLIGHT

### Defect
`registerCheckRoutes` had ZERO named callers outside its folder. Autoload fp was not
acceptable as the greppable mount. FE CheckDetail/Print already in manifest.

### Fix (this PR)
- `index.ts`: import + `await registerCheckRoutes(app)`
- `accounting/index.ts`: ignore `checks.routes` (no double-mount)
- Guard `verify-check-routes-mounted.mjs` PASS

### BEFORE (live 2026-09-29T16:18Z)
registry=4 (1001–1004 voided) · check_expenses=5 all void · live=0

### 3+4 accounting
1001/1002/1003 (+1004 AUTH-125) = voided seat tests. Four junk ($1x3 + $25 Smithfield) =
seat tests, all void. Said plainly.

### Next after merge
AUTH-126 OPEN → run r224 full-chain → CONSUMED with MID/AFTER paste.

## DO NOT
- Leave a live unvoided check in USMCA
- Double-register checks.routes via autoload + index (boot crash)
- Steal CC-2 opening-balance / escrow
