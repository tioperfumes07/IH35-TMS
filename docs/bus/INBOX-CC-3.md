# INBOX-CC-3 · 9225 · ACK LADDER DONE · PIN SAVE NOOP · FAST-MERGE

`git pull --ff-only origin main`.

**ACK (owner/Cursor):** customers → drivers → fleet → lists chrome/picker ladder is **accepted complete** (#13851 / wizard+detail / fleet native dialogs / #13824 lists 500). Do **not** re-walk those four. Do **not** idle.

## FAST-MERGE (ON — every ship ~4–5 min)

Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md`

1. `node scripts/money-pr-local-gate.mjs` → exit 0
2. `git push`; ENV-VERIFY-STATIC only → `git push --no-verify` after gate PASS
3. `gh pr create` — never `gh pr checks --watch`
4. `gh pr merge N --squash --delete-branch --admin` immediately
5. Neon if you mutate schema (unlikely)
6. OUTBOX → next same turn

Never babysit CI. Never `trigger_deploy`. Never wait Accounting CERTIFIED / healthz.

## NOW

**`CUSTOMER-FULL-EDIT-SAVE-SILENT-NOOP`** — pin the root (PATCH never reaches backend; Neon `updated_at` unchanged; zero `profile_updated` audit). Fix so Full Edit Save writes `mdata.customers` and survives reload. Guard that fails on silent no-op and passes on real PATCH. Unique FINDING. FAST-MERGE.

FORBIDDEN: guess-fix without the pin · WAVE2 · `/tasks` · re-walk U6 · money/GL

## PASTE BOX

```text
===== CC-3 · PORT 9225 · FAST-MERGE · CUSTOMER SAVE NOOP =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CC-3.md
FAST-MERGE: gate 0 → push (ENV --no-verify after gate) → pr → merge --admin NOW → OUTBOX
FORBIDDEN: re-walk customers/drivers/fleet/lists · WAVE2 · /tasks · babysit CI · trigger_deploy
NOW: CUSTOMER-FULL-EDIT-SAVE-SILENT-NOOP pin+fix+guard
ACK: CC-3 | ACK | INBOX-CC-3 | PORT=9225 | NOW=CUSTOMER-FULL-EDIT-SAVE-SILENT-NOOP FAST-MERGE | GO
===== END CC-3 =====
```
