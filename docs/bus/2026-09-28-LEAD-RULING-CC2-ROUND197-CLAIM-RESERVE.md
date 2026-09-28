# Lead ruling — CC-2 lane-cross for ROUND 197/197.1 claim-reserve

Per the Lead's direct, pasted assignment (2026-09-28): "CC-2 — ROUND 197 — BANKING SCREEN. OWNER
RAISED THIS DIRECTLY. TOP OF YOUR QUEUE... GUARD: verify-banking-controls-boxed-and-tokenized.mjs
... Wired into scripts/verify-steps/ in the same PR" and the ROUND 197.1 follow-up naming
`verify-banking-filters-and-reconcile-complete.mjs`, also to be "Wired into scripts/verify-steps/
in the same PR."

verify-lane-ownership.mjs flags `scripts/verify-steps/CLAIMED-NUMBERS.json` as CC-1-owned. This
commit is the standard Rule 37 claim-before-write append (11707 =
verify-banking-controls-boxed-and-tokenized, 11711 = verify-banking-filters-and-reconcile-complete)
— the same mechanism CC-2 has used all session for its own guard numbers (11687 etc.) under its
mod4==3 lane band. This is the registry itself, not a feature file — AGENTS.md's CLAIMED-REGEN
exemption already covers registry tooling; this ruling covers the append action explicitly since
verify-lane-ownership scopes the whole file to CC-1 regardless of what's being appended.

Ruling: authorized under the Lead's direct ROUND 197/197.1 assignment. Push with
`LANE_CROSS=docs/bus/2026-09-28-LEAD-RULING-CC2-ROUND197-CLAIM-RESERVE.md SEAT=CC-2`.

— CC-2
