# ROUND 221.1 — Lead Ruling: Devin-B Guard-Literal Defect Sweep (Lane Cross)

**Date:** 2026-09-29
**Seat:** Devin-B
**Authorization:** Round 221.1 — "DEVIN-B — ROUND 221.1 SHARED HELPER: APPROVED"
**Scope:** Guard infrastructure — no money surface, no data writes.

## Lane Cross

Devin-B is authorized to touch the following CC-1-owned files for this one-time
guard-literal defect fix:

- `scripts/lib/literal-or-const.mjs` (new shared helper)
- `scripts/verify-presettlement-shows-only-this-load-and-its-open-tour.mjs` (converted to use helper)

## Why

Three guards asserted a hardcoded literal against source the codebase had
correctly replaced with a named constant or design token. This blocked every
seat three times in one day. The owner assigned Devin-B the systemic fix:
sweep all guards, build one shared helper, convert affected guards.

## What Changed

1. New shared helper `scripts/lib/literal-or-const.mjs` — accepts either the
   raw literal or its `${CONST}` interpolation as equivalent forms.
2. `verify-presettlement-shows-only-this-load-and-its-open-tour.mjs` converted
   to use the helper for the `CLOSED_LOAD_STATUS` check. Assertion unchanged;
   selftest still catches removal of both forms.

## Non-Negotiable

No assertion weakened. No guard made report-only. Every converted guard's
selftest must still FAIL when the real thing is removed.
