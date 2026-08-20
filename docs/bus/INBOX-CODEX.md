# INBOX-CODEX · NOW · 2026-08-20T00:35Z · AUTO · NO ARCHIVE

**YOU ARE CODEX.** Reverse / connectivity / EntityLinkOrTombstone only. **No CDP. No Chrome Live. No Clicked.** Devin-A owns 9227. **No money/GL posters** (CC-1). **No lists +Add new** (CC-2). FAST-MERGE every PR same turn. Idle = defect.

```text
git pull --ff-only origin main
# then READ:
docs/bus/CODER-INSTRUCTIONS-NOW.md
docs/bus/INBOX-CODEX.md          # THIS file, TOP only
docs/bus/SEAT-COMMS-LAW.md
docs/bus/FAST-MERGE-4MIN-LAW.md
```

Write OUTBOX **before you code** (generic “continuous mode” paste is **NOT** an ACK):

```text
Codex | ACK | STANDARD=MATRIX-READY | NOW=drivers reverse FE | NEXT=customers reverse | GO
Codex | WORKING | NOW=DRV-PROFILE-OPS-REVERSE | file=<path you are editing> | GO
```

## VOID (do not reopen)

- `CLS-SILENT-LIST-CAP-FACTORING` — shipped [#10144](https://github.com/tioperfumes07/IH35-TMS/pull/10144)
- Any factoring / settlements **poster**
- 502 diary PRs
- Waiting for Jorge / waiting for Cursor chat

## OWNER SEQ (urgency)

accounting → banking → factoring → settlements → **drivers** → customers → vendors → dispatch → then rest.

You start at **drivers reverse FE**. Money modules are CC-1.

## NOW — first FO (do this, then next, no pause)

**DRV-PROFILE-OPS-REVERSE:** On `apps/frontend/src/pages/drivers/DriverProfilePage.tsx` and every `apps/frontend/src/pages/drivers/operations/*HistoryView.tsx` / `OperationsHistoryTable.tsx`: any **unit / load / vendor / accident / WO / bill** that is already an FK on the row MUST render `EntityLink` or `EntityLinkOrTombstone` (human label, never raw UUID). If a column is already `entityKind=`, prove the table actually drills. If a cell is still plain text with an id sitting next to it, that is YOUR FO.

**THEN same turn:** next unpaid reverse on drivers (profile reverse sections, layover already has loads — skip if green). **THEN** customers reverse → vendors reverse → dispatch reverse PRIMARY (load↔driver/unit/customer/trailer). Dispatch inline assignment reverse already shipped [#10260](https://github.com/tioperfumes07/IH35-TMS/pull/10260) — do not re-do it; hop to the next unpaid reverse leaf.

**Guard:** ratchet an **existing** `scripts/verify-drivers-*.mjs` or `verify-*-reverse*.mjs`. **Do not** add `scripts/verify-steps/NNNN-*.mjs` unless `NNNN` is already on `origin/main` CLAIMED (Rule 37). Cursor EVEN / you are not Cursor — prefer **no new step file**.

## FAST-MERGE (you)

1. `node scripts/money-pr-local-gate.mjs` exit 0 (tip contains `origin/main`)
2. `git push` — husky `verify-static` hang AFTER gate PASS → `--no-verify` authorized
3. `gh pr create` — never `gh pr checks --watch`
4. `gh pr merge N --squash --delete-branch --admin` same turn
5. OUTBOX shipped line → **start NEXT FO same turn**

Title: `Codex- fix(drivers): <FINDING> — <one line>`

## 502 / scoreboard

API `https://api.ih35dispatch.com/api/v1/healthz/shallow` **502s** while Render `IH35-TMS` is **1 instance** in pre-deploy. **Keep shipping.** Live=BLOCKED until JSON 200. Do not sit on 502. Do not open outage PRs.

## If this TOP still names a merged FO after pull

`SEAT-COMMS-LAW.md` — ping Cursor OUTBOX. Keep working the ladder.
