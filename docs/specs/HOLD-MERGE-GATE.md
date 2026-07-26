# HOLD-MERGE-GATE (updated 2026-07-26)

## Owner ruling (2026-07-26)

**`JORGE-APPROVED` is no longer required to pass this check.**

Jorge is not a PR reviewer. Money / product questions must be answered **before coding** (block invent / dispatch inventory). See `docs/specs/PRE-BLOCK-OWNER-QUESTIONS-LAW-2026-07-26.md`.

Devin merges when CI is green. Agents never invent unanswered policy mid-PR.

## What this job still does

1. **Classifies** PROTECTED vs neutral (title HOLD, migrations, financial writes, flag flips) — log only.
2. **Fails hard (only remaining red)** if the PR introduces a **held migration** but `scripts/db-migrate.mjs` on the branch lacks the held-migration **prod firewall** (`shouldSkipHeldOnProd`). Label cannot bypass this (2026-07-12 incident class).

## What it no longer does

- Does **not** require `JORGE-APPROVED`
- Does **not** block merge of financial/HOLD PRs for missing owner label

## Workflow

`.github/workflows/hold-merge-gate.yml` still runs on every PR (required check stays green when firewall OK).

## History

- 2026-06-20: title-blind HOLD merge near-miss → label gate created  
- 2026-06-08 #815: self-merged financial migration  
- 2026-07-12: held migration without firewall  
- **2026-07-26:** owner removes label requirement; front-load questions instead  
