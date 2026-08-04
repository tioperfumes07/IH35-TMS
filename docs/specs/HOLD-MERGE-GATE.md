# HOLD-MERGE-GATE (updated 2026-08-03 — label DELETED, firewall stays)

## OWNER LAW (2026-08-03, FINAL — supersedes the 2026-07-26 "no longer required" wording)

**The owner-approval merge label is DELETED, not merely optional. It does not exist as a concept in this repo's
merge process.** Every coder (Cursor, Claude, Devin, Cascade) has FULL Neon access and merge authority and
merges on green itself, in every lane, including financial/migrations. See
`.cursor/rules/00-operating-method-LAW.mdc` (governance section).

Jorge is not a PR reviewer. Money / product questions must be answered **before coding** (block invent / dispatch inventory). See `docs/specs/PRE-BLOCK-OWNER-QUESTIONS-LAW-2026-07-26.md`.

Every coder merges its own work when CI is green — no role split. Agents never invent unanswered policy mid-PR.

## What this job still does

1. **Classifies** PROTECTED vs neutral (title HOLD, migrations, financial writes, flag flips) — log only.
2. **Fails hard (only remaining red)** if the PR introduces a **held migration** but `scripts/db-migrate.mjs` on the branch lacks the held-migration **prod firewall** (`shouldSkipHeldOnProd`). Label cannot bypass this (2026-07-12 incident class).

## What it no longer does

- Does **not** require owner-approval merge label
- Does **not** block merge of financial/HOLD PRs for missing owner label

## Workflow

`.github/workflows/hold-merge-gate.yml` still runs on every PR (required check stays green when firewall OK).

## History

- 2026-06-20: title-blind HOLD merge near-miss → label gate created  
- 2026-06-08 #815: self-merged financial migration  
- 2026-07-12: held migration without firewall  
- 2026-07-26: owner removes label requirement; front-load questions instead  
- **2026-08-03 (FINAL):** OWNER LAW — label DELETED outright; every coder has FULL Neon access + merge
  authority in every lane; migration firewall is the only remaining hard-fail
