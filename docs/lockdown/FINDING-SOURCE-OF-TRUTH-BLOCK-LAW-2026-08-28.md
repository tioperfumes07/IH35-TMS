# FINDING SOURCE-OF-TRUTH BLOCK LAW (owner 2026-08-28)

**Permanent.** Missing or mismatched block = **UNVERIFIED**, not a finding. Chat claims without this block do not count.

Would have caught at file-time (not fix-time):

- Devin DP8 — queried `account_role_bindings`; code reads `chart_of_accounts_roles`
- Devin N=0 — queried the screen; the claim was about the ledger
- Claude `max()` bug — queried an aggregate; the aggregate lied
- Claude “$13,651 stranded” — queried 1150; 1090 held another $5,374.40

## Required block (every FINDING)

Exactly these three labelled lines (column-0 or indented under the board cell). All three required:

```
SOURCE-OF-TRUTH: <exact table/file the CODE reads> — proven at <file:line of the read>
I QUERIED:       <exactly what I ran>
NOT CHECKED:     <what this query did not cover>
```

Rules:

1. You cannot fill `SOURCE-OF-TRUTH` without opening the code. That is the point.
2. If `SOURCE-OF-TRUTH` and `I QUERIED` name different things (especially a LOOKALIKE pair in `docs/specs/SOURCE-OF-TRUTH-MAP.md`), the claim is **UNVERIFIED**.
3. `NOT CHECKED` must be honest blast radius (other accounts, other entities, sample vs operating, other tables).

## Where it is required

- New / edited OPEN rows in `docs/audit/GUARD-WORKORDERS.md`
- Any new `docs/audit/**/*FINDING*` file
- Claude-green PR bodies when `FINDING:` is not `N/A` (template)
- OUTBOX `FINDING |` one-liners should point at a board row that already carries the block

## Guard

`scripts/verify-finding-source-of-truth-block.mjs` — mechanical presence + LOOKALIKE mismatch on PR diffs.

**CC-2 owns wire-up:** claim ≡3 → `scripts/verify-steps/NNNN-verify-finding-source-of-truth-block.mjs` (Rule 25/37). Until that step is on main, the script is shippable and runnable locally; CI enforces after CC-2 lands the step.

## Companion

- Map: `docs/specs/SOURCE-OF-TRUTH-MAP.md`
- Triple-lock: `docs/audit/FINDINGS-TRIPLE-LOCK-LAW.md` (block is additive; does not replace board/register/routing)
- Claude evidence: `docs/templates/CLAUDE-GREEN-PR-BODY.md`
