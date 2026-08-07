# docs/law — the law registry

**PERMANENT LAW (owner-locked 2026-08-05) §2 — "LAW = ENFORCED GUARD, OR IT IS NOT LAW."**

`LAW.json` is the single enumerable list of live law in this repo: every entry names the locked
document the rule lives in, and the guard file that enforces it (or `null` if it is a judgment rule).
`scripts/verify-law-registry.mjs` is the required check — existence-only, ~0.5s including its
selftest — that reddens the build when a law registered as `enforced` names a guard file that is not
on disk.

## Why this exists

The law above shipped on 2026-08-05 and named both `docs/law/LAW.json` and
`scripts/verify-law-registry.mjs` by path. **Neither existed on main.** So the one rule whose entire
subject is *"a rule with no guard is not a rule"* was itself unguarded, and nothing in the repo could
answer "which locked decisions are actually enforced, and by what file?" That is the mechanism behind
answered owner decisions getting re-asked and re-litigated every session — the registry that would
have made the answer citable in one grep was never built.

## Entry shape

```json
{
  "id": "LOCK-02-CASHFLOW-IS-A-MODULE",
  "title": "one line, readable, citable — what the rule actually says",
  "source_file": "docs/lockdown/00_LOCKED_DECISIONS.md",
  "guard": "scripts/verify-cashflow-module.mjs",
  "type": "enforced"
}
```

| field | rule |
|---|---|
| `id` | unique across the registry; stable — other docs cite it |
| `title` | one line; what the law says, not what the guard does |
| `source_file` | the locked `.md`/`.mdc` the law lives in; must resolve on disk |
| `guard` | path to the `verify-*.mjs` that enforces it, or `null` |
| `type` | `enforced` (guard required, must exist) or `judgment` (guard must be `null`) |

## Registering a new law

1. Write the rule in its locked document as usual.
2. If it is **mechanically checkable**, ship its guard **in the same PR** and add the entry with
   `type: "enforced"`.
3. If it is a **judgment** rule ("professional", "honest", "McLeod-quality"), add it with
   `type: "judgment"` and `guard: null`. Judgment rules are not force-guarded — but they are
   *registered*, so the full set of live law stays enumerable in one file.
4. `node scripts/verify-law-registry.mjs` must exit 0 before you push.

## What the check does and does not claim

It asserts **existence and structure only**: unique ids, valid `type`, `source_file` resolves,
`enforced` => guard path resolves, `judgment` => guard is null. It deliberately does **not** run the
guards, read their contents, or judge whether a guard actually enforces its law — those are the
guards' own job and `verify:guard-wired`'s. Keeping it to ~0.5s is what lets it be required on every
PR without adding measurable PR time, exactly as the law specifies. A cheap check that always runs
beats an expensive one that gets skipped.

## Backlog class — old rules

The law is explicitly **phased**: every *new* rule ships registered, while pre-existing rules migrate
in as a backlog class. `LAW.json` was seeded with the laws already on main that already have a real
guard file — it is a starting inventory, not a complete census of every rule in `docs/lockdown/`,
`docs/CLAUDE.md`, `AGENTS.md` and `.cursor/rules/`. Adding the remainder is append-only work; the
registry may only grow.

## Wiring

- Required check: `locked-guards / locked-guards` (an owner-approved mandatory context in
  `.github/workflows/required-checks.yml`) runs `--selftest` then the check.
- Also runs inside `npm run verify:pre-commit` as verify-step **2733**
  (`scripts/verify-steps/2733-verify-law-registry.mjs`), i.e. under `ci / build-typecheck`.
- `npm run verify:law-registry` runs it locally.
