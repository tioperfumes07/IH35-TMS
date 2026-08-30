# Proof-engine shadow lever (2026-08-30)

**Not a new C25–C31 bar.** Economics Live is still: sql-runner replay of the committed INV at live SHA with INV-0 seeing `je_control`. This file names the **job lever** and where the **disagreement count** is supposed to be visible.

## `PROOF_REPLAY_FAIL_ON_FAIL` — the only enforcement switch

`scripts/proof-engine/replay-all.mjs` always **computes** PASS/FAIL/other. It **`process.exit(0)`** unless `PROOF_REPLAY_FAIL_ON_FAIL=1`.

`.github/workflows/prod-postdeploy-verify.yml` runs replay with **`continue-on-error: true`**. Today that is **shadow mode**: a red C25 must not fail the postdeploy job, or the step gets deleted in a week.

That is **not** “we have enforcement.” Enforcement is **unset**. Do not tell Jorge the job gates economics.

### When (and only when) to pull the lever

- **Per module**, when **that module’s disagreement list is empty** (replay `fail === 0` for that module’s proofs, on a connected run at live SHA).
- **Never globally.** Never arm because “the instrument exists.” Never arm all seven economic columns at once because one of them went green.

Until a named module is armed in the workflow (module-scoped env or an allowlist in replay), the default stays shadow.

## Visibility — the number Jorge asked for

Replay writes `docs/module-completion/PROOF-ENGINE-REPLAY.json`:

| Field | Meaning |
|---|---|
| `disagreement_count` | Same as `fail` — proofs that derived FAIL at live SHA |
| `pass` / `other` | Honest remainder (other includes UNVERIFIED / no DATABASE_URL) |
| `database_url_present` | Whether sql could even connect |
| `enforcement.armed` | Whether `PROOF_REPLAY_FAIL_ON_FAIL=1` on that run |

GitHub **artifacts age out**. The JSON is **derived**; it is **not** the module-completion status board and must **not** be hand-stamped into `status` / `prod_verified`.

Until a board strip exists, every postdeploy run must put **`disagreement_count` in the Actions job summary** (`GITHUB_STEP_SUMMARY`) so the number is readable without opening the artifact. That is still not enforcement.

## Order (unchanged)

1. CC-1 connected sql run — paste raw output. No econ cell cited until then.
2. GitHub secret `PROD_READONLY_DATABASE_URL` (read-only).
3. One real postdeploy replay with that secret.
4. **Then** the enforcement conversation — per module, empty disagreement, never global.

Planner grid is separate product work (GO-PLANNER-01).
