# AUDIT-FIX Block Template

Use this template to materialize an AUDIT-FIX dispatch slot. Keep the file in `.txt` format for dispatch packets.

```
═══════════════════════════════════════════════════════════════════════════════
Block NN of 32 — PHASE CLOSURE-V2 / TASK AUDIT-FIX-NN — <TITLE>
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: C-XX  ·  LANE: <A|B>  ·  CURSOR-<A|B>
SEQUENCING: dispatch after named upstream gate
PAIRED WITH: <paired block if any>

SOURCE:
  - Deep Audit references and/or GAP re-slot references
  - Link `docs/trackers/closure-v2.md` for queue provenance

PROBLEM:
  - One paragraph describing why this fix slot exists and what risk it addresses

SCOPE — ADDITIVE ONLY, NO CODE CHANGES IN THIS SLOT FILE:
1. Exact workstream bullets for future implementation
2. Allowed files guidance
3. Guard/verification expectations

ACCEPTANCE:
[ ] Scope landed
[ ] CI guard(s) present
[ ] No cross-lane file edits

PAUSE:
  - Explicit stop condition(s), if any

STANDING ORDERS:
  - foreground only no subagents
  - no retries; paste exact error on stop
  - measured data only; no guesses
═══════════════════════════════════════════════════════════════════════════════
```

Notes:
- Placeholders must include the line: `Awaiting Deep Audit findings — populate before dispatch`.
- Do not dispatch from this folder directly during CLOSURE-29; materialize files only.
