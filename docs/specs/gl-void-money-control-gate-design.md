# GL/Void — money-control kill switch on journal-entry void (AF-7 wiring)

**Block:** GL-VOID-1 (financial cluster — HOLD-FOR-JORGE). **Status:** flag-gate wiring only. No new GL math.

## What this ships
Wires the AF-7 flag **`MONEY_CONTROL_VOID_REVERSAL_ENABLED`** (per-entity, default OFF) onto the existing
journal-entry void action. The void endpoint (`POST /api/v1/accounting/journal-entries/:id/void`) already
exists and calls the existing `voidJournalEntry(...)` service. This block adds a gate at the top of
`voidJournalEntry`: if the flag is not enabled for the entity, the action is refused with the policy error
`void_reversal_disabled` (mapped to **409**) **before any read or write** — so an OFF entity can never mutate
a JE. Nothing new posts; `voidJournalEntry` is reused verbatim.

## Two orthogonal void flags — do not conflate
| Flag | Layer it controls | This block |
|---|---|---|
| **`VOID_ENFORCEMENT_ENABLED`** (shipped, migration 0206..1200) | *Mechanics*: when ON, void posts an equal-and-opposite **reversing JE** (`postVoidReversal`) and allows Owner+Accountant; when OFF, void is an Owner-only status flip. | unchanged |
| **`MONEY_CONTROL_VOID_REVERSAL_ENABLED`** (AF-7, migration `202607110320`, held) | *Action availability*: whether the void action is permitted **at all**, per entity. The owner's kill switch. | **wired here** |

They compose cleanly: `MONEY_CONTROL_VOID_REVERSAL_ENABLED` decides *whether you may void*; `VOID_ENFORCEMENT_ENABLED` decides *what voiding does to the GL*. The money-control gate runs first.

## Behavior impact (read before merging)
`MONEY_CONTROL_VOID_REVERSAL_ENABLED` is **per-entity-only, default OFF**, and its seed lives in the **held**
migration `202607110320_af7_money_control_flags.sql` (not yet on prod). Consequences on merge + deploy:
- **Until AF-7 is applied on prod AND the owner sets a per-entity override to ON, JE void returns 409** for
  every entity. This is the intended money-control posture (void is owner-enabled entity-by-entity —
  verify-then-flip), but it is a **behavior change to a currently-open action**. Merging this makes JE void
  owner-gated; it does not silently no-op.
- On a fresh CI DB the AF-7 migration *does* apply (non-prod), so the flag row exists at `false`; with no
  override the gate resolves OFF. No tests exercise JE void today (0 files), so CI stays green.

**Open question for the owner:** confirm you want JE void OFF-by-default per entity (the AF-7 design). If yes,
merge order is: apply AF-7 on a Neon branch → set the per-entity override ON for the entities that should
have void → merge this. If you'd rather JE void stay open until AF-7 is deliberately turned on, say so and
this gate can instead treat flag-absent as "open" (a different, less strict posture).

## Reuse (no new GL math — constitution §1.4/§2)
- `voidJournalEntry` (`journal-entries.service.ts`) — the existing void path, unchanged except the leading gate.
- `isEnabled` (`lib/feature-flags/service.ts`) — the canonical per-entity flag resolver.
- No migration authored here — AF-7 already exists as a held migration.

## Period close / reopen — same money-control pattern
This block also wires the other two AF-7 flags onto the existing period actions in `p7-wave2.routes.ts`:
- **`MONEY_CONTROL_PERIOD_CLOSE_ENABLED`** on `POST /api/v1/accounting/periods/:id/close`. The gate resolves
  **before `BEGIN`**, so an OFF entity never posts the retained-earnings closing JE or mutates the period;
  refused with `period_close_disabled` → 409.
- **`MONEY_CONTROL_PERIOD_REOPEN_ENABLED`** on `POST /api/v1/accounting/periods/:id/reopen`. Gate before the
  `status='open'` UPDATE; refused with `period_reopen_disabled` → 409.

These gate the **close/reopen ACTIONS**; they are independent of the DB trigger (migration 0183) that already
blocks *posting into* a closed period unconditionally. Same behavior posture (A/B) as JE void — all three are
per-entity, default OFF, seeded by the held AF-7 migration.

## Guards
- `scripts/verify-je-void-money-control-flag-gate.mjs` — JE void gate.
- `scripts/verify-period-money-control-flag-gate.mjs` — period close + reopen gates.

Both (wired into `verify:arch-design` + `locked-guards.yml`, with `--selftest`) lock the invariant: flag-key
const present; `isEnabled(client, KEY, …)` resolves and throws the policy error **before** the mutation
(the JE `status='voided'` write / the close `BEGIN` / the reopen `status='open'` write); the route maps each
to 409; the flags are in `PER_ENTITY_ONLY_FLAG_KEYS`; and AF-7 seeds each `default_enabled=false`. Self-tests
cover pass + each failure mode.
