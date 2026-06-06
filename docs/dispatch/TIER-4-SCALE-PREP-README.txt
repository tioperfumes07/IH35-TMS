================================================================================
TIER 4 — SCALE PREPARATION
================================================================================
4 blocks, ~6 days
Before 300 trucks: partition + canary + lock-in + limitations

Master spec: docs/dispatch/GAP-BLOCKS-REMAINING-2026-06-06.md
Created: 2026-06-06

================================================================================
BLOCKS IN THIS TIER
================================================================================

  BLOCK-26-of-29-TIER4-PARTITION.txt
  BLOCK-27-of-29-TIER4-CANARY.txt
  BLOCK-28-of-29-TIER4-VENDOR-LOCKIN.txt
  BLOCK-29-of-29-TIER4-KNOWN-LIMITATIONS.txt

================================================================================
DISPATCH PROTOCOL (every block)
================================================================================

  1. REPO RECONNAISSANCE FIRST — 5-15 min read-only verification
     - Does the spec match the actual codebase shape?
     - If MISMATCH: STOP, surface 3 options to Jorge
  
  2. DEDUPE AUDIT CHECK — confirm ✅ CLEAN status in audit doc
  
  3. PREVIEW (if UI-touching) — Jorge-approved mockup before code
  
  4. MANIFEST FIRST — update .block-ready.agent1.json as Step 1
  
  5. 4-GATE DONE — squash-merge SHA + branch deleted + Render deploy + healthz 200
  
  6. NO --no-verify

================================================================================
STANDING REFERENCES
================================================================================

  docs/trackers/QBO-FEATURE-PARITY-REQUIREMENTS.md  — design source-of-truth
  docs/trackers/SAFETY-TRUST-RECOMMENDATIONS.md     — trust framework
  docs/audits/DEDUPE-AUDIT-2026-06-06.md            — dedupe audit
  docs/dispatch/GAP-BLOCKS-TIER1-TRUST-2026-06-06.md — Tier 1 foundation
  docs/dispatch/GAP-BLOCKS-REMAINING-2026-06-06.md  — this tier's master spec

================================================================================
END OF README
================================================================================
