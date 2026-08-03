# Acceptance evidence block (required before "done")

**Prefer the Claude-green labelled-line form** (Rule 30) — same text in the **commit message** and **PR body**:

See **[CLAUDE-GREEN-PR-BODY.md](./CLAUDE-GREEN-PR-BODY.md)** for the copy-paste template.

```
FINDING: …
LANE: …
ROOT CAUSE: …
FIX: …
… DOD / VERIFY / MODULE_PROGRESS / MIGRATE …
GUARD: scripts/verify-….mjs + scripts/verify-steps/NNNN-….mjs
LIVE PROOF: node scripts/verify-….mjs --selftest exit 0; …
REMAINING: …
```

## Heading form (also accepted by CI)

### ROOT CAUSE
<!-- One sentence. Name the actual failure (constraint, pg_code, HTTP status, log class). -->

### FIX
<!-- What changed at root — not symptom-only. List files. -->

### GUARD
<!-- scripts/verify-*.mjs and/or vitest name. Must fail on bug, pass on the fix. -->

### LIVE PROOF
<!-- Deploy sha + endpoint / Neon query / command exit 0 — or UNVERIFIED: <named blocker> -->
<!-- Forbidden theater: "LIVE PROOF: UNVERIFIED browser" (no colon/emdash blocker) -->

### REMAINING
<!-- `none` OR explicit open work. Never claim module done while N of M incomplete -->

## Local gates

```bash
node scripts/money-pr-local-gate.mjs
node scripts/cursor-pr-body-gate.mjs --body-file /tmp/pr-body.txt
```
