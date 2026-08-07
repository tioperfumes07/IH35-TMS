# Method enforcement guards (CI teeth)

Bound by `00-operating-method-LAW.mdc` (lands via governance PR). Artifact: `docs/audit/wave-queue.json`.

| Guard | Step | Purpose |
|---|---|---|
| `scripts/verify-wave-card-format.mjs` | **2220** | CLS-* cards only — root cause, lane, layer, instances, completeness, drain_proof |
| `scripts/verify-no-false-green-certify.mjs` | **2222** | `complete:true` illegal while any touching wave is open/draining |

Both support `--selftest` (planted RED + clean GREEN). Wired via verify-steps auto-discovery (Rule 17 — no package.json / locked-guards thrash).

Schema: `docs/audit/wave-queue.SCHEMA.json`.
