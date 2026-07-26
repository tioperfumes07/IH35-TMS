FOR CURSOR — ACCOUNTING + BANKING DOMAIN BLOCKS · GUARD-VERIFIED · 2026-07-26 (snapshot 5ce94c8)

  BLOCKS-ACCOUNTING.txt ........ ACCT-DOM-01 (no SOX JE approval/segregation — DESIGN first) · ACCT-DOM-02
                                 (subledger↔GL rec surface — read-only, system-wide primitive) · ACCT-DOM-03
                                 (closed-period trigger missing on posting LINES). Engine itself is STRONG (verified).
  BLOCKS-BANKING.txt ........... BANK-DOM-01 (recon match ledger in RETIRE bank.* — VERIFIED; owner ruling+migration) ·
                                 BANK-DOM-02 (closed sessions not immutable) · BANK-DOM-03 (no real bank-rec model) ·
                                 BANK-DOM-04 (no reconciling-item aging) · BANK-DOM-05 (no intercompany transfers) ·
                                 BANK-DOM-06 (fuel expense→GL candidate-only + no overage→liability).
  00-RULES-OF-ENGAGEMENT-NO-COLLISION.txt ... file boundaries, migration bands, merge protocol.

GATES: ALL of these are FINANCIAL-HOLD → JORGE-APPROVED + owner Neon-applies. Design + guard only; NEVER build
GL-posting math solo; reuse the existing poster; flags default OFF; QBO reconcile-only, no write-back (locked).
BANK-DOM-02 + ACCT-DOM-03 SHARE one guard = the system-wide "no writes to a closed period/session" invariant.
Every block to the block-builder standard: DoD A–E + VERIFY 1–8, all 18 keys, Rule 16 evidence, live $0.05
smoke→Neon proof on TRANSP AND USMCA where money moves.
