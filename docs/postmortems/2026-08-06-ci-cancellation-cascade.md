# Post-mortem — 2026-08-06: the CI cancellation cascade

**Impact:** ~8 hours. Every open PR unmergeable. Money PRs carrying live financial fixes (WORM
revokes, ledger grants, a $1,643.21 duplicate-bill defect) could not be verified or merged. At the
worst point 49 runs queued with 0 executing, and of 45 completions **39 were cancelled and 6
succeeded**.

**Zero of it was a code failure.** Across eleven PRs at the peak, the count of genuine `FAILURE`
checks was **two** — one CodeQL upload (environmental) and one `Service Unavailable` at *Prepare all
required actions* (infrastructure). Everything else was `CANCELLED` or `QUEUED`.

---

## The one-paragraph version

A GitHub Actions platform outage stopped runs from starting. A latent defect in our workflows —
concurrency keyed on the **ref** with `cancel-in-progress` — turned that delay into permanent damage,
because every new trigger cancelled queued runs that had never executed, and **a cancelled required
check is terminal: it never re-reports**. Then the agent diagnosing it (CC-1) read status fields
instead of job logs, concluded wrongly three times, and "fixed" it with re-runs — each of which was a
new trigger, which cancelled more queued runs. The loop was self-feeding: the remediation *was* the
fault amplifier.

---

## Causal chain, in order

**1. GitHub Actions outage (external).** Started 15:22 UTC, ~7h, platform-wide. Workflow runs failed
to start; the Actions REST API returned errors (which is also why `POST .../runs/{id}/cancel`
returned HTTP 500 for a while). Confirmed on githubstatus.com and in the trade press. Nothing in this
repo caused it and nothing in this repo could fix it.

**2. Ref-scoped concurrency (latent defect, ours).** All 22 workflows carried:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

Keying on the **ref** means any new trigger on a branch cancels the previous run on that branch —
including one still `queued` that had never executed. Harmless when runs start immediately; fatal
when they do not. Observed: eleven workflows cancelled **within one second of each other** at
`18:57:46` when a new trigger landed at `18:57:45`.

Worse, it discarded *completed* work. Job log of a `build-typecheck` run:

```
verify:pre-commit step 1407/1407 …
verify:pre-commit PASS
…
##[error]The operation was canceled.
```

That PR had passed the entire 1,406-step money gate. The result was thrown away.

**3. Diagnosis from status fields instead of logs (CC-1, the largest avoidable factor).** Three
confident wrong answers in sequence:

| claimed | actual |
|---|---|
| "all PRs share one inherited break" | five PRs, five *different* failing steps |
| "a GitHub outage is why nothing merges" | `main` was green throughout (run `31114768828`, `success`) |
| "0 runners executing, capacity is dead" | a run had completed `success` nine minutes earlier |

Each conclusion drove action: **17 re-runs, two close/reopens, two empty commits, one mass cancel**.
Under defect #2 every one of those was a new trigger that cancelled queued runs. Queue depth went
**37 → 42** while "fixing" it. The evidence that settled it was one `grep` in a job log that was
downloadable the entire time.

**4. Repo made public → private (correct, with a side effect).** Prompted by a genuine secret
exposure (Samsara ticket #3365290, *"Customer API Token found in Public GitHub Repo"*). Going private
disabled **code scanning**, because SARIF upload is a GitHub Advanced Security feature that is free
only on public repos. CodeQL began failing at the upload step while the scan itself was healthy —
4,639 TS + 4,244 JS files analysed, zero findings. A new permanent red, unrelated to any code change.

**5. The self-hosted runner "fix" (CC-1) briefly made it worse.** Five workflows were pointed at a
single Mac runner. One runner executes **one job at a time**, so nine PRs × six jobs serialised
behind it and were cancelled unassigned — job record `build-typecheck | cancelled | runner=(EMPTY) |
labels=self-hosted,mac`. A starved pool was traded for a single-threaded one. Reverted.

---

## Latent problems this exposed (all pre-existing)

1. **Ref-scoped concurrency** — would have bitten on any slow CI day.
2. **`build-typecheck` had exactly one possible home.** It declared `services: postgres`, and service
   containers are Linux-only, so the repo's most load-bearing required check could not run anywhere
   else. A required check with one home is a single point of failure for every financial merge.
3. **The Rule 16 evidence gate was structurally unsatisfiable by Dependabot.** It authors its body
   from a template and can never write a FINDING/ROOT CAUSE/LIVE PROOF block. Eight dependency PRs
   sat permanently red for a rule none of them could ever pass. A gate a whole class of PR cannot
   satisfy is not a gate, it is noise — and noise trains reviewers to ignore red.
4. **No capacity redundancy.** Zero self-hosted runners; hosted availability was a hard dependency
   for every money-lane gate.

---

## Rules that come out of this

**R1. Read the job log before ANY CI verdict.** `gh run view <id> --log-failed`. Never infer from
`conclusion`, `mergeStateStatus`, or queue counts. This is the same "verify primary evidence" rule
already applied to Neon; it applies identically to CI.

**R2. `CANCELLED` is not `FAILURE`.** Count them separately. A red ✗ in the UI is usually a
cancellation. One day's tally: 39 cancelled vs 6 succeeded — reported as "everything is failing".

**R3. An empty `statusCheckRollup` means there are NO checks, not failing checks.** The PR is
unmergeable because required contexts are *missing*. Re-running fixes nothing; only a new head SHA
creates runs.

**R4. Never "fix" CI by re-running.** Under any cancel-on-new-trigger policy, a re-run cancels the
queued run and manufactures the next red. If a re-run seems necessary, first establish *why* the
check has no result.

**R5. An `##[error]` at *Set up job* / *Prepare all required actions* is infrastructure, not code.**
`Service Unavailable`, `Failed to resolve action download info`. Read *where* in the log it died.

**R6. The Postgres service-container log dump is printed AFTER the job fails**, with internal
timestamps spanning the whole run. Those `FATAL` / `permission denied` lines are usually passing
negative-path tests asserting their own controls. A `FATAL` repeating on an exact interval is the
health-check, not a test — check the cadence against `--health-interval`.

**R7. One self-hosted runner is a serialisation bottleneck, not redundancy.** If hosted capacity is
the problem, the answer is several runners or a runner group.

**R8. Count by classification, not by array length.** Related failure the same day: the AR line
backfill was sized at "33,429 lines" by counting JSON array elements. Classified by `DetailType`,
12,063 of those were `SubTotalLineDetail` — restatements of the invoice total. Projecting them would
have **doubled AR by $40.85M**. Same mistake shape as reading a status field instead of a log:
counting without classifying.

---

## Fixed and on `main`

- **SHA-scoped concurrency** — `group: ${{ github.workflow }}-${{ github.event.pull_request.head.sha || github.ref }}`.
  Supersession is now confined to one commit: a redundant re-trigger of the *same* commit is still
  cancelled (intended), but a new push can no longer orphan the required checks of the commit the PR
  actually merges. Ships with a mutation-proven guard,
  `scripts/verify-ci-concurrency-sha-scoped.mjs`, registered in `docs/law/LAW.json` as
  `LAW-2026-08-06-CI-CONCURRENCY-SHA-SCOPED`.
- **CI back on hosted parallelism** with the proven Postgres service container, keeping the
  `-d ih35_verify` health-check fix (without `-d`, `pg_isready` probes a database named after the
  *user*, logging `FATAL` every 10s for the whole job — 54 per run — while still returning
  `PQPING_OK`; pure noise, but it is the noise that got misread as "the CI database is broken").
- **`scripts/ci-ephemeral-postgres.sh`** retained, unused, as a documented fallback for a future
  **Linux** self-hosted runner. Proven exit 0: full migration set applies against it.
- **CodeQL** keeps scanning with `upload: never` and enforces findings locally via
  `scripts/ci-codeql-enforce-sarif.mjs`, which fails the build on any error-level result *and* fails
  when the SARIF is absent. (`continue-on-error` was rejected — a green badge verifying nothing.)
- **Dependabot** exempted from the Rule 16 evidence gate, matching the existing precedent at
  `semgrep.yml:34`. Scope narrowed, not weakened: every human- and agent-authored PR still needs the
  block, and the CVE-delta gate still runs on dependency bumps.

## Still open

- **Rotate the exposed Samsara API token** (ticket #3365290). Going private stops future exposure; it
  does nothing about a credential already harvested from a public repo, and the secret remains in git
  history and in any fork taken while public.
- **Capacity redundancy.** Runner `ih35-mac-cc1` is registered but un-targeted. If hosted starves
  again, add *several* runners — ideally Linux, so service containers work.
- **Nothing enforces R1–R8 mechanically.** They are judgment rules. The one mechanical piece is the
  concurrency guard.
