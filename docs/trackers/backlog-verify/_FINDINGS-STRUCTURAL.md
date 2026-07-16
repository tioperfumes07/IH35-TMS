# Structural findings — backlog verification 2026-07-16

Two cross-cutting findings that are **not** individual blocks. Both were found while setting up the
per-block verification, and both change how the backlog itself should be read. Evidence is live and
reproducible on `origin/main` @ `52ad2c2ef`.

---

## FINDING 1 — the block registry is hollow (892 of 901 non-DONE blocks have no real acceptance)

**Verdict: OPEN (process defect, not a code defect). Owner decision needed on remediation.**

`npm run reconcile:blocks` (run fresh today, 2026-07-16) reports:

```
1449 blocks (68 retired dup/stale/superseded excluded)
DONE=548  NEEDS-VERIFY=50  PENDING=6  PENDING (GATED)=28  AUDIT-NOTE=817
MEASURABLE=632
```

The 901 non-DONE blocks were then read directly from `.block-ready/*.json`:

| fact | count | evidence |
|---|---|---|
| `.block-ready/*.json` files on disk | 1343 | `ls .block-ready` |
| files whose `allowed_files` is **boilerplate prose**, not paths | **972** | identical string: `"additive only; ALTER/CREATE on existing financial tables = PROTECTED owner-ceremony; never write a RETIRE table; no delete."` |
| files with **real file paths** in `allowed_files` | 358 | — |
| **non-DONE blocks with real `allowed_files`** | **9 of 901** | the other 892 carry the boilerplate |

Every boilerplate block also carries an identical generic `acceptance[]`:
`"table/column/fk/rls/route/mounted proven; ... guard wired; live proof."` — a *description of the
verification method*, not a per-block criterion. And each names a `source_file`
(e.g. `0007-pattern-1-unmounted-backend.txt`, `"source": "MASTER-6 authored dispatch"`) which
**does not exist anywhere in the repo** (`find . -name '<id>.txt'` → 0 results; `grep -rl MASTER-6 docs/`
returns only manifests that *reference* it, never the dispatch itself).

**Consequence:** the standard per-block protocol — "read the block's `allowed_files` + `acceptance`,
check them" — **cannot execute for 99% of the backlog as registered.** There is nothing to check
against. Any tool that reports these blocks as DONE/PENDING is reporting on a registration, not on a
verifiable criterion.

**The real acceptance data was found elsewhere:** `docs/trackers/MASTER-MANIFEST-2026-07-10.json` —
1533 rows carrying genuine `title`/`verdict`/`evidence`/`missing`/`acceptance[]` (typed kinds:
table/column/fk/rls/route/mounted/guard/data/live/design/migration) + `linkage{tables}` + `module`.

- **686 of the 901** non-DONE blocks join to it by `id` → these have real, checkable acceptance.
- **215 do not join** → but all 215 carry reconciler `evidence` text (incl. all 28 `PENDING (GATED)`
  Tier-1 items such as `AF-1-entity-coa-fix`, `AF-4-ap-bills-migration` (~$1.18M A/P), the escrow and
  IFTA blocks), so they are verifiable from evidence + code, just not from the registry.

**Recommendation (owner decision — no action taken):** the `.block-ready` registry is not a source of
truth today; `MASTER-MANIFEST-2026-07-10.json` is. Either backfill the registry from the manifest, or
retire the boilerplate registrations. Until then, **`reconcile:blocks` counts registrations, not
verified work** — consistent with the known rule that `DONE` = merged, not verified.

---

## FINDING 2 — 694 of 1006 CI guards cannot fail CI, and 33 of them are RED right now

**Verdict: OPEN — false protection. This is the highest-leverage finding in this pass.**

The repo defines its own CI-gated guard set in `scripts/verify-static.mjs` → `ciRunGuardSet()`
(lines 120-144). A guard only gates CI if it is reachable from an aggregate npm script, a
`.github/workflows/*` file, or `scripts/verify-steps/*`. Replicating that exact function:

```
guards on disk:              1006
CI-GATED (repo's own defn):   312
UNWIRED (cannot fail CI):     694
```

`verify-static.mjs` itself already acknowledges this split — it runs every guard but annotates each
`gated`, and **exits only on gated failures** (`gatedFailCount`, line 248). Unwired failures are
printed as `INFORMATIONAL ONLY`.

Running the full static suite read-only on `main` (no DB, dead-port sentinel):

```
total 1006 | PASS 949 | FAIL(gated) 1 | FAIL(unwired) 33 | SKIP-needs-db 21 | SKIP-needs-env 2
```

**33 guards assert real invariants, are FAILING on main today, and nothing gates them.** Selected —
these are not cosmetic:

| guard (unwired, currently FAILING) | what it asserts |
|---|---|
| `verify-inv2-no-hard-delete-accounting.mjs` | **void-never-delete invariant** (§2) — hard delete in accounting |
| `verify-p0-settlement-schema-grants.mjs` | settlement schema grants — "caller removed without updating grant guard" |
| `verify-migration-schema-grants.mjs` | every `CREATE SCHEMA` must `GRANT USAGE` (the 500-at-runtime class) |
| `verify-coa-canonical.mjs` | chart-of-accounts canonicalization |
| `verify-ifta-tax-rates-current.mjs` | **missing/sparse IFTA tax rates for Q3-2026** (a filing-calendar defect) |
| `verify-hos-tracker-endpoints.mjs` | HOS breakdown-day > 1440 min must force `available:false` |
| `verify-samsara-hos-pull-real-clocks.mjs` | per-driver HOS insert batches must be savepoint-isolated |
| `verify-recurring-bills.mjs` | 4 issues |
| `verify-insurance-module.mjs`, `verify-damage-insurance-continuity.mjs` | insurance module + damage↔insurance continuity |
| `verify-pre-settlements.mjs`, `verify-pre-dispatch-validation.mjs` | pre-settlement / pre-dispatch gates |

Plus **1 CI-gated failure on main**: `verify-pass-8-clean-baseline.mjs` — missing report
`docs/audits/PASS-8-PRE-PROD-SMOKE-RESULTS.json`.

**Why this matters more than any single block:** the standing rule is "every bug fix gets a static CI
guard so it can't regress." That rule is only as good as the wiring. **A guard written for a fix and
never wired is indistinguishable from no guard at all** — it produces the *feeling* of protection with
none of the effect. 33 of them are already red, meaning the invariants they protect have very likely
already regressed, silently.

**Not fixed here (verify-only work order).** Wiring a guard is a code change and several of these are
financial-cluster. Each failing guard needs triage: is the guard stale, or is the invariant genuinely
broken? That is Phase B work and the financial ones need the owner's gate.

**Caveat, stated honestly:** the 33 FAIL results are from a local run with no database
(21 further guards SKIP for want of Postgres; 2 for want of env/dist). A guard can fail locally for
environmental reasons. Each of the 33 needs individual triage before being called a real defect — but
the *wiring* gap (694 unwired) is structural and independent of the environment.

---

*Verifier pass, read-only. No code edited, no migrations authored, no prod DB accessed, nothing merged.*
