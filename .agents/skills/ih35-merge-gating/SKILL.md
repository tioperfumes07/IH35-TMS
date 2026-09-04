---
name: ih35-merge-gating
description: Historical owner directive on auto-running tools and merge gating. Load alongside current AGENTS.md / 00-IH35-LAW.mdc; the "Jorge merges" clause below is superseded by OWNER LAW 2026-08-03 (merge on green + proof, no JORGE-APPROVED).
---

# ih35-merge-gating

**Source:** auto-generated Cascade memory `2f069840-0f56-45ff-a4d0-a2c75b3e2860`.

> Jorge has explicitly directed: auto-run ALL terminal commands, file edits, and git operations WITHOUT asking for approval each time. EXCEPTION — NEVER MERGE A PR YOURSELF. For every block: open PR → report PR# + SHA → STOP → Jorge merges. This applies doubly to anything touching: settlements, deductions, escrow, factoring, category-map, posting, ledger, payroll, or any $ amount — those are GATED (PR then full stop, no exceptions). Only pause before: merge, deploy, force-push, or deleting data. Repo: /Users/jorgemunoz/IH35-TMS-fixed

## Current status

- **Superseded on merge gating:** `00-IH35-LAW.mdc` §Scope and `AGENTS.md` §PERMANENT LAW state OWNER LAW 2026-08-03: NO HOLDS, NO `JORGE-APPROVED`, coders **merge on green + proof**. Money/migration changes use proof gates (18-key evidence, migration firewall, independent live verify-after), not an owner-approval hold.
- **Still valid:** the auto-run / pause-before-destructive-actions discipline is captured in `AGENTS.md` `## Tool invocation and merge gating`.
