# INBOX — CC-1 · running queue log (queue-discipline standing rule, effective 2026-09-01)

Every instruction received gets appended here, in order, before acting on it, so the queue
survives a context loss. Newest at bottom. Mark `[DONE <evidence>]` / `[BLOCKED <on what>]`
inline once resolved; never delete a row.

1. ON CALL + VOID ORDER (16:38 CT): bill↔load FK real (742c44f). Fix any UI that cannot void
   invoice/bill/settlement/load in that order. SETL-UX-01 = LOW, parked until after void-10.
2. LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01: driver account pair backfill (86
   drivers), RECON-CLOSED-SESSION-NO-AUTHORIZED-PATH, pg_constraint standing rule, mdata_assets
   duplicate-FK cleanup. [DONE — backfill apply route + guard shipped, dup-FK migration merged]
3. P0-1 SETL-SELECTION-BINDING (rigorous re-entry bar) + P0-2 VOID-CANCEL-NOT-VOID (full
   cascade: invoice+driver bill+settlement line+reversing JE, fail loud on partial).
   [SETL-SELECTION-BINDING: proof posted, freeze not lifted, awaiting Codex/CC-2 confirm]
   [VOID-CANCEL-NOT-VOID: DONE — PR #18978/ACCT-F10166, invoice cascade + fail-loud gates]
4. VOID-REVERSAL-SOURCE-TAG root cause + fix spec (readOriginalGlPostings resolves JE via
   source tag, then reverses ALL lines). [DONE — already fixed under parallel claim 10181,
   credited, my duplicate abandoned]
5. BANK-ORPHAN-01 owner ruling: void must un-categorize the matched bank transaction, build
   into the cascade not a cleanup job, guard named in a workflow.
   [DONE — shared unmatchBankTransactionsForVoid/unmatchBankTransactionById wired into
   postVoidReversal, PR #18989. Reach-back backfill route for the 4 pre-fix orphans shipped
   PR #19001/ACCT-F10197 (dry-run + Owner/Accountant-gated apply); apply not yet executed
   against prod, that is the owner's/an authorized session's explicit go]
6. SETL-NO-VOID-PATH-01: no void/reverse path for driver settlements at all, 17 stuck.
   Detail-view control, same void.service.ts path, cascade incl. BANK-ORPHAN-01, LOCKED
   requires explicit unlock, Owner/Accountant only, reverse-vs-void decision grounded in
   existing code (governance executor already uses reversed_at, not voided_at).
   [DONE — PR #18989, guard scripts/verify-settlement-void-cascade.mjs 8/8]
7. VOID LAW (full sweep): detail-view control + void banner + first-class status filter +
   Owner/Accountant-greyed-with-request-to-owner (reuse identity.workflow_requests +
   OwnerApprovalPortalPage, do not build a second request system) across invoice/bill/
   bill_payment/payment/expense/settlement/work_order/load/journal_entry.
   [PARTIAL — settlements only (item 6). Remaining 8 entity types NOT started.]
8. LAW-FIX-INSTANTLY-FULL-REGISTER-2026-09-01, CC-1's 10 items: (1) SETL-SELECTION-BINDING
   (2) SETL-NO-VOID-PATH-01 (3) BANK-ORPHAN-01 (4) VOID-BTN-01 (5) VOID-PERM-01 (6) INV-UI-
   VOID-01 (7) RECON-NO-OPEN-SESSION (8) bills never auto-created, 39 loads/$14,789.50
   (9) SETL-DUAL-APPROVAL (10) SETL-NEGATIVE-NET-01.
   [1/2/3 DONE per above. 4-6 = the VOID LAW sweep, not started beyond settlements.
   7 RECON-NO-OPEN-SESSION investigated: mechanical, not a code gap -- POST .../start already
   works, needs a live-Chrome click for the current period (or an owner decision on
   auto-rollover). 9 SETL-DUAL-APPROVAL and 10 SETL-NEGATIVE-NET-01 investigated and root-
   caused, both need an owner decision before building (not silently picked) -- see
   docs/audit/GUARD-WORKORDERS.md rows appended 2026-09-01. 8 (bills never auto-created) NOT
   STARTED.]
9. Permission model migration handoff from Devin-A (migration authority is CC-1's, HH00-11).
   [Superseded — Cursor applied 202613312000_permission_model.sql directly; confirm with
   Cursor what remains before any re-authoring. Not yet literally confirmed via message
   to/from Cursor, only inferred from CLAIMED-MIGRATION-NUMBERS.json + db/migrations/.]
10. INV-OPEN-VOID-01 moved up (worsening in real time): amount_open_cents / amount_unapplied_
    cents (x2) are GENERATED columns blind to voided_at/status='voided'. 41 invoices/$72,237.34
    phantom open now, was 33/$45,837.34 four hours ago, ~190 documents left to void tonight.
    [DONE — PR #18997/ACCT-F10193, migration 202613310300 merged. ih35-migration-guard review
    caught 2 real defects pre-ship: silently-dropped security_invoker on the recreated
    views.ar_aging (RLS bypass risk) and grant widened to PUBLIC instead of ih35_app; both
    fixed, guard scripts/verify-inv-open-void-respects-void.mjs (step 10193) tightened to
    assert both positively, 9/9 mutations. Recompute-on-alter confirmed empirically by the
    subagent against a live Postgres container.]
11. NEW OWNER RULE: driver auto-inactivation, no load in 40 days -> status change only (never
    cascade-delete), scheduled daily, sourced from mdata.loads (not a status field), reversible
    +traceable audit row, reactivates on new load assignment, match BY PERSON (fail loud on
    ambiguity), never inactivate a driver with open settlement/unpaid bill/escrow balance.
    Coordinate with Codex (roster/load-recency data).
    [QUEUED — behind items 3/6/10/5, not started]
12. Driver account provisioning, revised scope (supersedes the 15-driver-roster scoping):
    EVERY driver who moved a load in 2026 (load-assignment columns, not driver_bills — that
    undercounts by 5). USMCA: 14 moved a load, 8 have both accounts, 6 have neither (Angel
    Alfonso Sosa, Antonio Navarrete Leon, Genaro Guerrero Chavez, Jose Antonio Vicente
    Martinez, Javier Vargas Solis, Jorge Luis Infante Corona). TRANSP 91e0bf0a FROZEN, do not
    touch. "Juan USMCA-Battery" flagged (Inactive, is_sample_data=false, has both accounts) —
    confirm with owner before touching.
    [BLOCKED — on Codex's DRIVER-PERSON-IDENTITY-01 landing first (Angel Alfonso Sosa is one
    of the 3 split-name drivers; provisioning before identity lands = duplicate escrow
    liability, a real balance-sheet error, not cosmetic)]
13. Devin-A handoff: driver account provisioning migration + job authorship is CC-1's
    (Devin-A has cited opening balances for the 14 drivers, cannot author migrations).
    [Same as item 12 — BLOCKED on DRIVER-PERSON-IDENTITY-01]
14b. WITHDRAWN: INV-NUMBERING-01 (mine) and CC-3's INV-F-DISPLAYID — load-numbered invoices are
    the owner's LINKAGE DESIGN (one trip identifier carried across invoice/driver-bill/expense,
    tied to the settlement), not a defect. SETL-NUMBERING-01 withdrawn same reason. Not built
    against either. EXP-NUMBERING-01 RESPECIFIED (not mine to build -- Cursor's NUMBERING item):
    129/132 expenses have expense_number=NULL; correct format is <load#>-<seq> (matching
    L-20260831-0004-1/-2 pattern); the defect is the NULLs, not the numbering scheme. PROFORMA:
    locked per claude/OWNER-DECISIONS-FINAL-2026-07-26.md §B -- same record earlier in its life,
    not a separate document type, no separate numbering series, no touching the conversion;
    already correctly enforced in poster.service.ts + ledger-integrity-detectors.service.ts.
    [Logged, no action needed from CC-1 -- not touching any of these]
14. QUEUE DISCIPLINE standing rule (ALL SEATS): new instructions APPEND, never redirect;
    never stash/reset/checkout away from uncommitted work for a new item; commit/push what's
    safe first; report DOING/QUEUED/BLOCKED/DONE with evidence every update; log every
    instruction here before acting.
    [DONE — this file adopted, OUTBOX-CC-1.md queue-status entry posted this turn]

15. ALL-SEATS LAW: NO SEAT-CREATED FINANCIAL RECORDS IN PRODUCTION, effective now. Permitted
    only: owner-ordered live-walk records, voided same-session with a reversing entry. Forbidden:
    any standing fixture/probe/proof left in prod (owner had to personally adjudicate 17
    unflagged expenses tonight, two carrying seat-written "do not void" instructions in his own
    ledger memo field). CC-2 owns the guard (named in a workflow).
    [Acknowledged -- this session created no financial records in prod this turn, nothing to
    void. Applies going forward: any live-UI verification I do must be created, proven, and
    voided in the same session, record ID + reversing JE id reported.]

**STATED QUEUE ORDER (owner, most recent restatement):** SETL-SELECTION-BINDING (proof posted
twice, freeze NOT lifted, awaiting Codex/CC-2 confirm) → SETL-NO-VOID-PATH-01 (DONE, PR #18989)
→ INV-OPEN-VOID-01 (DONE, PR #18997) → BANK-ORPHAN-01 (DONE, PR #18989 + #19001 — apply not yet
run against prod, awaiting authorized session).

All four P0s now shipped or proof-posted. Next: LAW-FIX-INSTANTLY-FULL-REGISTER items 4-10
(VOID LAW sweep beyond settlements, SETL-DUAL-APPROVAL, SETL-NEGATIVE-NET-01,
RECON-NO-OPEN-SESSION, bills-never-auto-created) — none started yet.
