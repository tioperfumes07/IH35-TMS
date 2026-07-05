# IH35-TMS — Agent coordination

> **Rule #0 (LOCKED):** Before any work, read [docs/specs/QUALITY-STANDARD-LOCKED.md](docs/specs/QUALITY-STANDARD-LOCKED.md) — the first standing law of this project; it supersedes every other rule/doc on conflict.

> **★ CONSOLIDATED ARCHITECTURE GUARDRAIL (read this too):** [docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md](docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md) is the current consolidated guardrail — the **Law of the Land** total-connectivity rule, the driver **Bill + BillPayment** settlement model, the **Faro** exact factoring terms, the auto-provisioned **driver accounts**, the **posting flags**, and the **per-build-block linkage checklist**. **Every build block (especially financial) conforms to it.** See the checklist reproduced at the bottom of this file.

## Dual lanes (always parallel when queue has work)

| Lane | Path | Role |
|------|------|------|
| A | `IH35-TMS` | Safety, Drivers, Lists, INFRA-1 |
| B | `IH35-TMS-agent2` | Dispatch, Maintenance, INFRA-2 |

## Never idle

Cursor rule: `.cursor/rules/dual-lane-never-idle.mdc` (`alwaysApply: true`)

Hook: `.cursor/hooks.json` → on **subagentStop**, injects follow-up to dispatch the next **abb** block per lane.

**Queue:** `/Users/jorgemunoz/Downloads/abb/00-TIER-2-3-DISPATCH-INDEX.txt`

**Done:** squash merge SHA on `origin/main`, branch deleted, CI green.

## If coordinator looks stale

Say: `agent is idle and stale` — or run `/loop 10m STATUS both lanes — abb queue, dispatch if idle`

## Canonical rules (tracked source of truth)

- **Sidebar / module count = 28 items**, defined in
  `apps/frontend/src/components/layout/sidebar-config.ts` → `SIDEBAR_ITEM_IDS`, enforced by
  `scripts/verify-sidebar-contract.mjs` (`LOCKED_ORDER`). The number **rendered** depends on role, and `eld`
  is a hidden stub. **Source of truth is the config array — never a hardcoded number.** (Supersedes any
  older "15 modules" / "23 items" claim in local `CLAUDE.md` or `docs/lockdown/00_LOCKED_DECISIONS.md`.)

## PER-BUILD-BLOCK LINKAGE CHECKLIST (GUARDRAIL)

Reproduced from §9 of [docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md](docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md)
(the blueprint is canonical if this ever drifts). Every build block — **especially financial** — must
satisfy ALL of these before it is "done", verified on **live data**, forward AND reverse:

- [ ] Every **money transaction** links to a **vendor OR customer** + the **GL account** (expense / bill / bill-payment / invoice / journal-entry / liability / asset) it posts to + an **audit** record.
- [ ] Every transaction links to its **load / dispatch** (where applicable) and the **driver / unit / asset** involved.
- [ ] Cross-module links present where relevant: **maintenance, safety, legal, insurance, customer, vendor** (e.g. a repair bill → unit + vendor + load (G18) + WO + expense acct + JE; a damage deduction → the claim → escrow liability; an insurance/legal event → the entity + its financial impact).
- [ ] **Forward + reverse** drill-through — no dead-end screen, no orphan row.
- [ ] **RLS** entity-scoped + **audit** on every table; verified on **live data**, not assumed.
- [ ] No orphaned created-but-unused id, no built-but-unwired poster / route, no unlinked sub-account.

**If any box is unchecked, the block is NOT done.**
