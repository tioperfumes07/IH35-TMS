================================================================================
TIER 2 — TRUST HARDENING
================================================================================
10 blocks, ~15 days
Production-ready operational depth, parallel-friendly

Master spec: docs/dispatch/GAP-BLOCKS-REMAINING-2026-06-06.md
Created: 2026-06-06

================================================================================
BLOCKS IN THIS TIER
================================================================================

  BLOCK-04-of-29-TIER2-RATE-LIMIT.txt
  BLOCK-05-of-29-TIER2-CIRCUIT-BREAKERS.txt
  BLOCK-06-of-29-TIER2-OUTBOX-DLQ.txt
  BLOCK-07-of-29-TIER2-PAGINATION-AUDIT.txt
  BLOCK-08-of-29-TIER2-LOAD-TEST.txt
  BLOCK-09-of-29-TIER2-E2E-PATHS.txt
  BLOCK-10-of-29-TIER2-RLS-TEST-GATE.txt
  BLOCK-11-of-29-TIER2-AUDIT-COVERAGE.txt
  BLOCK-12-of-29-TIER2-DESTRUCT-PREFLIGHT.txt
  BLOCK-13-of-29-TIER2-TUNING-CATALOG.txt

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
