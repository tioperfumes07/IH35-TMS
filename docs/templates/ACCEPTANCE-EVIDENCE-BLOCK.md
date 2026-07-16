# Acceptance evidence block (required before "done")

Copy into PR description or handoff. **Incomplete block = not done.**

## ROOT CAUSE
<!-- One sentence. Name the actual failure (constraint, pg_code, HTTP status, log class). -->

## FIX
<!-- What changed at root — not symptom-only. List files. -->

## GUARD
<!-- scripts/verify-*.mjs and/or vitest name. Must fail on bug, pass on fix. -->

## LIVE PROOF
<!-- Deploy sha + endpoint / Neon query result / Render log line / browser path. -->
<!-- If blocked: UNVERIFIED — [what blocks proof and what was verified instead] -->

## REMAINING
<!-- `none` OR explicit owner-approved deferral: tracker file + future block id -->

## LINKAGE (financial / cross-module only)
<!-- Canonical tables, forward + reverse drill, audit on mutation -->
