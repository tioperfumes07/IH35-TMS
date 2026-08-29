# IH35-TMS — THE HONESTY PROGRAM
### Five blocks that make the whole product enforce itself. Owner-approved 2026-08-29.

**Governing standard:** `docs/lockdown/SUBSCRIPTION-GRADE-DEFINITION-OF-DONE-2026-08-29.md`
> *"It is as if we had a subscription with QuickBooks or McLeod. I know I can trust the software to
> register and link correctly where it should record and register."*
> **The test is not "did it work when someone checked." The test is: the owner never checks.**

---

## THE META-RULE — READ BEFORE BUILDING ANY OF THIS

**Every guard here is REGISTRY-DRIVEN and covers the WHOLE product. None is written for one file.**

Owner, 2026-08-29: *"These checks, guards, enforcement, etc. must be for all the software, not just
applied to one."*

A guard that hardcodes one path protects one path and rots the day something new is added. Every
guard below reads a registry of everything it governs, and **fails closed when something in scope has
no entry.** That is what makes coverage grow automatically instead of decaying.

Three properties, non-negotiable, on every guard in this program:

1. **Registry-driven** — a JSON list of everything in scope. Adding a new posting path / screen /
   stored artifact without a registry entry **FAILS**. Silence is never a pass.
2. **Planted-mutation selftest** — `--selftest` breaks the thing on purpose and proves the guard
   catches it. An assertion nobody has watched fail is an assertion nobody can trust.
3. **Fails closed** — missing file, missing field, unresolvable ref each FAIL with their own message.
   Never SKIP. Both lane-band guards silently skipped for five seats; `isAncestor()` called
   unresolvable refs "not an ancestor". Both cost real days.

**Also forbidden, in all five blocks:** spec-vs-spec checks (a closed loop proves nothing) · rewriting
working code to satisfy a stale matcher (the DOT-fields near-miss) · `trigger_deploy` by anyone but
Cursor · U14 restamp · bulk-voiding TEST data.

---

# BLOCK H1 — THE ACCOUNT-CODE CONTRACT  *(P0 — the biggest hole in the product)*
**Owner: CC-1. Nothing else in this program matters as much.**

## The defect

`apps/backend/src/home/scenario-registry.ts` declares, per scenario:

```ts
je: "DR Accident Loss / CR A/P or Escrow"
```

`je` is typed `string`. Traced end to end: service passes it through (`scenario-tracker.service.ts:243,303`)
to `hop.je ? <div>` in `ScenarioTrackerHome.tsx`. **It is a display label. Nothing parses it. Nothing
compares it to what actually posted.**

**19 of 28 scenarios declare a posting. Zero are checked against it.**

A green scenario proves the fat join returned rows and a JE exists. It does **not** prove the money
landed in the designed account. That is the entire distance between your board and a QuickBooks
subscription — and it is unguarded today.

## Build

**1. Make the contract machine-readable.** Replace the prose `je` with a structured field on every
posting scenario, keeping the prose for display:

```ts
je: "DR Accident Loss / CR A/P or Escrow",          // human label, keep
je_contract: {                                      // NEW — the enforceable part
  lines: [
    { side: "DR", account_code: "6800", account_role: "accident_loss" },
    { side: "CR", account_code_any_of: ["2000", "2350"], account_role: "ap_or_escrow" }
  ],
  must_balance: true
}
```

Use `account_role` against `catalogs.accounts` where a code differs per entity — **the role is
canonical, the code is per-entity.** Never hardcode one entity's code into a shared contract.

**2. Registry of every posting path — all 28.** `docs/specs/accounting/POSTING-CONTRACTS.json`, one
entry per GL posting flag:

```
AMORTIZATION · BANK_FEED · BANK_TX_SPLIT · BILL · BILL_PAYMENT · CUSTOMER_PAYMENT · DRIVER_ADVANCE ·
DRIVER_ESCROW_FORFEIT · EXPENSE · FACTORING · FINANCE_HUB_AMORTIZATION · FIXED_ASSET_AUTOPOST ·
FUEL_CARD_OVERAGE · GL_POSTING · INSURANCE_CLAIM_RECOVERY · INVOICE_AR · LEASE · PARTS_PURCHASE ·
PREPAID_EXPENSES · PROPERTY_TAX · REIMBURSEMENT · RELATED_PARTY_LOAN · REVENUE_RECOGNITION ·
SAFETY_FINE · SETTLEMENT · TONU_CANCELLATION_AR · TRANSFER · WARRANTY_REIMBURSE
```

**A posting path with no contract entry FAILS the guard.** That is how this covers the product rather
than one scenario.

**3. `scripts/verify-posting-hits-designed-accounts.mjs`** — for every contract, take the JEs that path
produced and assert: the account codes match the contract (or resolve through `account_role`), signs are
correct, **DR = CR**, and no posting used an account outside its contract. Report per path:
`contract | JEs found | matched | MISMATCHED | no-contract`.

**4. Wire it into the scenario tracker.** A scenario may not read `done` on `n > 0` alone — the
contract must also hold. **Done ≠ the join returned rows.**

## Selftest — plant all of these, each must be caught
wrong DR account · wrong CR account · flipped signs · DR ≠ CR · a posting path with no contract entry ·
a contract naming an account that does not exist in `catalogs.accounts` · an entity-specific code
hardcoded where a role belongs.

## Done
Every one of the 28 posting paths has a contract; the guard runs green on live data; a planted wrong
account fails the build; the tracker will not green a scenario whose JE violates its contract.

---

# BLOCK H2 — SHIP THE FRESHNESS GUARD, PRODUCT-WIDE
**Owner: Cursor (infra). Built and tested; needs committing and widening.**

Files delivered: `verify-derived-artifact-freshness.mjs` (selftest **9/9**) ·
`DERIVED-ARTIFACTS.json` · standard in the DoD doc.

**On its first run against real main it caught two live defects:**

```
verifier-rollup.json      49 commits behind live   (feeds every V1-V6 verifier column)
program-scoreboard.json   declares neither healthzSha nor generated_at
```

The second is the disease itself: **the board you look at has no record of when it was true.**

## Build
1. Commit the three files; wire the guard into `money-pr-local-gate.mjs` and CI (`fetch-depth: 0`).
2. **Widen the registry to EVERY stored derived answer in the product** — not the two I found. Sweep
   for committed JSON/TS that is generated rather than authored: scoreboard rows, module-completion
   generated TS, evidence-class and HTTP-recheck outputs, matrix rollups, audit snapshots.
   **Any generated artifact not in the registry is a hole.** Add a companion check that flags
   generated-looking files absent from the registry.
3. Give every entry `healthzSha` + a timestamp, and a `regenerate` command that actually works.
4. **Then start deleting entries** — each artifact that moves to computed-on-read comes off the list.
   `scenario-tracker.service.ts` already states the law in its own header:
   *"status is DERIVED at request time and never stored and read back."* That file got it right;
   `verifier-rollup.json`, written the same week, froze its answer. **The registry should shrink toward zero.**

## Done
Registry covers every generated artifact; guard green; the matrix header shows `asOf` + `healthzSha` so
a stale rollup is visible on screen instead of silent.

---

# BLOCK H3 — SENTRY IS DARK  *(P0 — unowned for five days)*
**Owner: CC-1 (it is an API/infra defect).**

`ih35-tms-prod` reported **5,009 errors in 14 days, then nothing since 2026-08-24T06:05:13Z** — through
six deploys, while `healthz` is DEGRADED. A system with 25 known unresolved issues and a failing health
check does not produce zero errors for five days. **Reporting is down, confirmed.** Dev and staging have
**never** reported at all.

## Build
1. Read `SENTRY_DSN` / `SENTRY_RELEASE` / `SENTRY_ENVIRONMENT` on the Render prod service; compare
   against the org's quota/usage. Fix the real cause — do not guess.
2. **Wire dev and staging** while you are in there.
3. **Add a heartbeat**: a scheduled canary event plus a check that fails when prod has reported nothing
   in N hours. An error pipeline that can die silently is an L3 violation *in the observability layer
   itself* — the layer whose whole job is to not be silent.
4. Triage the 25 unresolved issues by lane and **resolve them as they are fixed.** An issue left
   "unresolved" forever is how 25 defects hid in plain sight for a month.

## Done
Prod, dev and staging all reporting; the heartbeat check fails loudly when any stops; the 25 are triaged.

---

# BLOCK H4 — `background_jobs.stale`  *(unowned ~30 hours)*
**Owner: CC-2.**

The **only** failing check on `healthz`. Postgres, migrations, redis and R2 are all OK. It has survived
every deploy today. Reported as QBO inbound/CDC ~days stale with `invalid_grant`.

**H4 Cursor 2026-08-29:** QBO-named jobs are **dormant-by-design** unless `IH35_QBO_JOB_HEALTH_ARMED=true`
(USMCA-only; leftover TRANSP realm must not paint `stale_jobs`). When armed, A1-1 still uses
`qboRealmConnected` for inbound/CDC/push and master-data delta.

## Diagnosis runbook (do not rediscover)

1. **Never treat `/healthz/shallow` as a check verdict.** It always returns `ok: true` plus `version`.
   Read **`GET /api/v1/healthz`** (full body, `checks[]`).
2. Public JSON is **SEC-HEALTHZ-01**: failed jobs publish only the token `stale_jobs` (or
   `never_succeeded_jobs`). **Job names are not in the public body.**
3. **Pull the Render app log for the API service** (`srv-d7rpem7avr4c73fhp4n0`). Filter text
   `stale_jobs` or event `health_check_failed`. The structured field `internal_error` is
   `stale_jobs: <job_name>:<minutes>m | …` (pipe-joined).
4. After H4 deploys (`22b1b63e4` ancestor of live `healthz/shallow.version`): if `background_jobs.stale`
   is still FAIL, that is surprising — re-run step 3 before changing code. CC-2 has nothing to chase
   unless a **non-QBO** name appears.

**Incident 2026-08-29 (live SHA `b2448ce`, pre-H4 image):** every sample in the window was exactly
`integrations.qbo_inbound_sync:11841.4m | integrations.qbo_cdc_poll:11843.6m` (~8.2 days, last success
~2026-08-21). **No other job.** Dormancy on those two names is the entire yellow.

## Build
1. Identify precisely which job is stale and why — do not accept "QBO" as the answer without the job name.
2. Fix it, or **make the check honest**: if a job is intentionally dormant (USMCA QBO off), the check
   must say *dormant-by-design*, not `stale`. A permanently-yellow check trains everyone to ignore
   `healthz` — which is worse than no check.
3. Add per-job staleness thresholds so one dormant job cannot mask a genuinely dead one.

## Done
`healthz` reads `ok`, or every remaining warning names a job and a deliberate reason.

---

# BLOCK H5 — REVERSAL SYMMETRY HAS NO PRODUCER
**Owner: CC-1 (money) with CC-2 (GUARD) verifying. Start after SCEN-01 produces real chains.**

**C28 `reversal_symmetry` renders on the matrix and nothing computes it.** The render guard proves the
column is *drawn* — drawn is not computed. Same failure family, one layer deeper.

Reversal work exists only as one-off `run-acct-f*-reverse-*.mts` scripts and a `coa-asymmetry-report`
service. **No guard asserts a reversal restores every derived surface the posting touched.**
That is DoD rule 5 with nothing behind it.

## Build
1. `scripts/verify-reversal-symmetry.mjs`, driven by the **same POSTING-CONTRACTS registry as H1** — so
   it covers all 28 paths, not one.
2. For each path with reversal support: post, reverse, and assert **every derived surface returns to its
   prior state** — subledger balance, GL, trial balance, register, aging bucket, statement, cash
   forecast — and that the audit trail shows both events. **A silent delete is a FAIL.**
3. Feed the result into C28 so the column shows a computed value instead of nothing.

## Done
C28 has a real producer; every posting path with a reversal is proven symmetric; asymmetric paths are
named and visible rather than blank.

---

## SEQUENCE

| Order | Block | Owner | Why now |
|---|---|---|---|
| 1 | **H1 account-code contract** | CC-1 | Without it, every SCEN-01 green is "posted", not "posted correctly" |
| 1 | **H3 Sentry** | CC-1 | Five days blind going into launch |
| 1 | **H4 background_jobs** | CC-2 | 30h, only failing check, trains everyone to ignore healthz |
| 2 | **H2 freshness, widened** | Cursor | Built and tested; stops the whole board rotting silently |
| 3 | **H5 reversal symmetry** | CC-1 + CC-2 | Needs SCEN-01 chains to measure against |

H1, H3 and H4 are parallel — different seats, no shared files.

## THE DECLARATION — required on every block from now on

```
PROVES-IT-WORKS:  <runnable check + asserted outcome, incl. designed account codes>
KEEPS-IT-TRUE:    <recompute-on-read | regenerated by <job> + staleness guard <name>>
DERIVED-SURFACES: <every place this action must reach>
REVERSAL:         <what undoes it, and which surfaces it must restore>
BINDING:          <deploy SHA the proof was taken on; ancestor of live healthz>
COVERAGE:         <the registry this guard reads, and what happens when something is missing from it>
```

**A block missing `KEEPS-IT-TRUE` is a snapshot, not a finished thing.**
**A block missing `COVERAGE` protects one file and rots on the next one added.**

MIGRATE: N/A · KEEP TEST · never `trigger_deploy` · USMCA-only still governs launch leftover;
entity-of-convenience is permitted for scenario proof per the owner ruling.
