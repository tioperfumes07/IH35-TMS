# Orphan / Dead Component Guard

**Script:** `scripts/verify-orphan-components.mjs`
**npm:** `npm run verify:orphan-components` (also `:update`, `:list`)
**Runs in:** the `verify:arch-design` chain (CI).

## The bug class it kills

The #1 stale-file source: a component or page gets built but **nothing imports or
renders it**, so it looks "done" but never runs. Real example:
`apps/frontend/src/pages/banking/components/BankingReviewCenter.tsx` was built for
the banking-categorization feature and never wired into a route — invisible, dead,
and quietly rotting. This guard makes **new** orphans impossible to accumulate.

## How it works

1. **Import graph.** Statically scans every `.ts/.tsx` file under
   `apps/frontend/src` and extracts imports: static (`import … from`,
   `export … from`, side-effect `import "…"`), dynamic (`import("…")`), and lazy
   (`React.lazy(() => import("…"))`). Relative paths and the tsconfig/vite aliases
   (`@ih35/shared-types`, `@legal/*`) are resolved with the standard
   extension/`index` rules.
2. **Reachability.** BFS the graph from a set of **entrypoints** —
   `main.tsx`, `App.tsx`, the route manifest(s) (`routes/manifest.tsx`),
   `sidebar-config.ts`, and every `index.ts`/`index.tsx` barrel. Any file
   transitively reachable from an entrypoint is **live**.
3. **Orphan.** A `.tsx` component/page file (excluding `*.test.tsx`,
   `*.spec.tsx`, `*.stories.tsx`, `*.d.ts`, `__tests__/`, `__mocks__/`) that is
   **not** reachable and **not** on the allowlist.

A file reachable only through a test import, or only through another orphan, is
(correctly) still an orphan — a dead subtree is dead.

## The baseline (why it merges without a huge cleanup)

The current orphan set is committed to `scripts/orphan-components-baseline.json`.

- The guard **PASSES** when current orphans ⊆ baseline → prints `new_vs_baseline=0`.
- The guard **FAILS** when a **new** orphan appears, naming the file.

This is exactly the pattern used by `verify-schema-parity` and
`verify-mobile-responsive-audit`: freeze the existing debt, block *new* debt.

**The baseline is a burn-down list — shrink it, never grow it.** When you wire up
or delete a baseline orphan, run `npm run verify:orphan-components:update` to drop
it from the baseline (the guard also prints how many baseline entries are now
resolved, as a nudge).

## Fixing a new orphan (what to do when CI fails)

You have two correct options — **do NOT add it to the baseline**:

1. **Wire it (preferred).** Import & render it from a route in
   `routes/manifest.tsx`, or from a live parent component. If you built it, hook
   it up. If it was superseded, **delete** it (archive per §7 if it's a locked
   surface).
2. **Allowlist it (rare).** Only for a file that is *intentionally* a standalone
   entrypoint not reachable from the main graph. Add its repo-relative POSIX path
   to `scripts/orphan-components-allowlist.json`.

## Commands

```bash
npm run verify:orphan-components         # CI gate — exit 1 on a NEW orphan
npm run verify:orphan-components:list    # print every current orphan
npm run verify:orphan-components:update  # regenerate the baseline (burn-down)
```

## Burn-down intent

The baseline starts at ~200 pre-existing orphans (dead duplicates, test-only
components, superseded pages incl. `BankingReviewCenter.tsx`). That number should
only ever go **down**. Each block that touches the frontend is a chance to wire or
delete a few and re-run `--update`. The guard's job is to guarantee it never goes
**up**.
