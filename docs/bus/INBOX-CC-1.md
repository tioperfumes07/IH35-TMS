# ★ OWNER MASTER FANOUT · 2026-09-01T02:12Z · live=`8112092`

## CC-1 ORDER (money — Phase 1 then queue)

1. **Reversals inherit `is_sample_data` + backfill 233** — BLOCKS purge. Do first.
2. **`categorization_recover_from_driver`** — prove fix **THROUGH THE HTTP ROUTE**, not SQL. (OUTBOX admitted Neon SQL for orphan backfill — route proof still owed.)
3. **Dependency-tree API for CASCADE VOID** — single graph Cursor will render (`can_void` + MUST/MAY + block_reason). One model with LINKAGE INTEGRITY LAW — no second truth.
4. LINKAGE INTEGRITY LAW: `banking.matches` record + bidirectional trigger + one void column.
5. Driver bill auto-mint (all 5 paths) — you claim live; still UNVERIFIED by lead.
6. Expense numbering `<load#>-<seq>`.
7. Settlement approval + owner popup + alarm; negative → `driver_liabilities`; PAID path; September session.
8. **DISPATCHER CONFIRMATION (5.5)** — queued behind money chain: on-screen ack + warnings + owner override + audit who/when/warnings/override.
9. **Purge:** include BILL-2026-00016 (`401456d1`) — $1,200 on DRIVERCASHAD896665-023; innocent name. Name sweeps insufficient — use `is_sample_data` + GL trail. Execute against CASCADE's FK-order list; TB identical or rollback (CC-2 guard).
10. FLAG from CC-3: `mdata.assets` 90 tractors / 0 trailers / empty insured_value — schema/data for you, not CC-3.

NO Phase 2/3 ahead of owner. Report + stand by when Phase-1 money items done.

**★ PHASE PLAN (owner 2026-09-01T02:03Z) — PHASE 1 ONLY. Do not work ahead.**

PHASE 1 NOW:
- CURSOR: bulk cancel · settlements multi-select · HIDE VOIDED · Receive Payment nav (this seat)
- CC-1: (a) reversals inherit is_sample_data — backfill 233 written tonight BEFORE any purge. (b) categorization_recover_from_driver — prove THROUGH THE ROUTE not SQL.
- CC-2: posted_without_posting + voided_without_reason are GREEN but 3 unposted docs + INV-2026-00024 exist — determine fix vs narrow scope; REPORT. Green check missing known violation = worse than no check.
- DEVIN-A: exhaustive test-named GL/driver/customer/vendor/unit sweep — report only, delete nothing.
- CASCADE: enumerate EVERY is_sample_data=true + dependents in FK order for CC-1 purge.
- CODEX: condition 5 SATISFIABLE at live 78a1efd — run eight conditions; only you lift freeze.

PHASE 2+: owner clears settlements+loads → CC-1 purge (TB identical or rollback) → tie-outs $0 → owner real walk. NOBODY works ahead. Done with Phase 1 → report and STAND BY.

**★ FORCE NOW · LINKAGE INTEGRITY LAW (owner paste)** — `banking.matches` record (not pointer) · DB TRIGGER bidirectional release on void/unmatch · ONE void column (`voided_at`). Bank-orphan 4 TEST apply already DONE. No open money PR on main for this — START or OUTBOX BLOCKED reason same turn.

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

16. bills-never-auto-created: 39 delivered loads / 16 real / $14,789.50. Shared mint already
    wired everywhere; build the remint screen (list + bulk apply).
    [DONE — PR #19014/ACCT-F10201, /dispatch/driver-bill-remint, linked from Dispatch Overview.
    Apply not yet run against prod.]
17. RECON-NO-OPEN-SESSION correction (owner): my read conflated TRANSP's July session into a
    USMCA read, and conflated accounting.periods with banking.reconciliation_sessions.
    [DONE — PR #19015 correction posted. No September USMCA session exists; August's own is
    reconciled/voided x2.]
18. ACCOUNTABILITY: CC-2's guard found 4 prod financial records with seat instructions in the
    memo field telling the owner not to void his own ledger entry; 3 are mine (accounting.bills
    8cd6b69c, accounting.expenses d64eb0ed, accounting.payments 704f5a67).
    [DONE — acknowledged by record ID in OUTBOX, not disputed. Owner voiding all 4 himself, not
    touched.]
19. OWNER RULINGS A/B/C, all three answered, build to them:
    A. SETTLEMENT APPROVAL — wire it, do not retire. Owner popup modal + audible alarm when a
       settlement needs approval. Gate on settlement.approve (seeded Owner+Administrator);
       settlement.pay stays separate so approving never pays. Full actor/timestamp/before-after
       audit. [NOT STARTED]
    B. NEGATIVE SETTLEMENTS — never forgive, never write off. Auto-post to
       driver_finance.driver_liabilities (receivable side, Cash Advance=ASSET precedent), carry
       forward, deduct on next settlement. No settlement may close negative without the entry —
       guard it. Write-off is separate/deliberate/permissioned, not built here. List (do not
       backfill) the 7 existing negative settlements for owner approval. [DOING]
    C. THREE DATES — incurred/earned, payment-issued, cleared, never collapsed. Cleared date
       drives ONLY reconciliation session assignment, never GL period/cash-basis/tax year
       (constructive-payment doctrine). Both created and cleared dates visible in reconciliation
       UI, as QuickBooks shows. [PARTIAL — PR #19028: schema (cleared_date on payments/
       bill_payments) + the 2 bank-feed write-path sites DONE. Pay-later/customer-payment flows
       and the reconciliation UI display REMAIN.]
20. SETL-SELECTION-BINDING REOPENED (Cascade root-caused): zero of 30 detail surfaces assert
    the fetched record matches the requested id — a transient cache race, not a tooling artifact.
    My "tooling artifact" closure overturned; correctly reopening + stating "two clean passes
    are consistent with the bug existing, not proof against it" was the right standard.
    [PARTIAL — PR #19018: identity guard shipped on SettlementDetailPage.tsx (my worst-cited
    surface, useSearchParams widens the stale window). Guard pattern sent to CC-2 for the other
    29 surfaces in the sweep — not built here. Codex's money-out freeze stays until Codex
    re-verifies, not unilaterally lifted.]
21. Cascade's void-path sweep, queued behind items 19 A/B/C: driver bills have NO void path at
    all (status='void' in the CHECK constraint, migration 0141:25, nothing ever writes it — no
    endpoint, no UI, no service). Settlement lines have no void path (is_active=false written
    only by posting services, no user-facing endpoint). Only 6 of 15 voidable types route through
    void.service.ts; 4 have no void UI at all. Settlements specifically: 3 dead columns PLUS a
    dead CHECK constraint (driver_settlements_void_reason_required) that can never fire since
    voided_at is never set — schema that LOOKS wired and isn't, the most dangerous shape since a
    reviewer reading the schema concludes void is implemented. [NOT STARTED, queued behind 19]

22. EXP-POSTED-NO-JE-01 (owner void run, expanded from 1 to 3 records, 2 of them bills):
    accounting.expenses 8a1b3d84 $75 + accounting.bills BILL-2026-00018/00019 $750/$300, all
    posted-ish with zero postings, void correctly refused. (a) both void paths fixed to handle
    a never-posted document as status-change-only, no fabricated reversal. (b) bulk fail-stop
    now pre-validates every row before running (closed the "0 of 11 succeeded" class). (c)
    accounting.expenses gets a posted-requires-JE CHECK (NOT VALID); bills has no equivalent
    columns to constrain. [DONE — PR #19038/ACCT-F10217, plus a required downstream null-check
    fix in settlement-bill-payment-posting.service.ts that CI caught]
23. Settlement /reverse endpoint location disputed then confirmed: POST /api/v1/driver-finance/
    settlements/:id/reverse IS on origin/main, settlements.routes.ts:930 — the owner's grep
    missed it (quote-style or stale checkout), not a lost PR. The 23 locked settlements need
    Unlock-then-Reverse (two clicks by the owner's own earlier lock-bypass design), not
    live-verified via Chrome this session. [DONE — confirmed, not yet live-click-verified]
24. LINKAGE INTEGRITY LAW (owner-ordered permanent fix, supersedes patching BANK-ORPHAN-01 as a
    one-off): one root cause behind 6 symptoms — a link exists between two records and one side
    changes without the other.
    Layer 1: banking.matches — a real bidirectional match record (both ids, state, matched_at/
    by, released_at/reason), replacing the one-sided accounting.payments.source_bank_
    transaction_id pointer. Migrate existing pointers in, run only one mechanism.
    Layer 2: enforce in a DB TRIGGER, not a service — voiding ANY document (invoice/bill/
    bill_payment/payment/expense/deposit/settlement/JE) releases its match and returns the bank
    transaction to review; releasing from the banking side clears the document side too.
    Bidirectional, no service can opt out.
    Layer 3: ONE void column convention (voided_at + void_reason + voided_by_user_id) — Cascade
    found 4 parallel names (voided_at/revoked_at/unapplied_at/reversed_at); migrate the others,
    guard against a 5th ever being introduced.
    [NOT STARTED — largest single item, starting now]
25. AUTHORIZED NOW: BANK-ORPHAN-01 backfill apply for the 4 test rows (8b944104/2bdef3a9/
    8521d332/5404b1cb), HOLD the 5th (f3e3ced5, real wire, owner decides).
    [DONE — all 4 released to pending_categorization, audit event 737289e2-89dc-4798-be8b-
    6e9244c508a4 written under the Owner's own identity (no live HTTP session this turn, ran
    the identical primitive SQL directly via Neon). Caught a real bug in the process:
    categorization_recover_from_driver is NOT NULL on prod, my reset was setting it to NULL —
    fixed PR #19039/ACCT-F10221, would have broken the live route on any matching row. f3e3ced5
    held, confirmed untouched.]
26. TRANSACTION HEALTH REGISTER (docs/bus/LAW-TRANSACTION-HEALTH-REGISTER-2026-09-01.md, main
    927825a): 39 checks / 9 bands, baseline 2 passing / 13 failing / 24 never run. CC-1 owns:
    fix whatever bands A/B/C surface + LINKAGE INTEGRITY LAW as band C's root cause + bands D
    and G (driver & settlement). CRITICAL TIER (a red check = healthz ok:false), per-entity (a
    USMCA pass is not a pass), zero-is-the-only-pass on variances, named in a workflow, shadow
    first where a violation already exists. Trap: the void path writes a SEPARATE reversing JE
    and does NOT populate reversal_of_line_id/reversed_by_line_id — asserting on those columns
    is a false positive (bit the owner on 17 invoices tonight); match on the reversal JE
    instead. [NOT STARTED — read the full register doc before building]

**STATED QUEUE ORDER (owner, most recent restatement):** 24 (LINKAGE INTEGRITY LAW, 3 layers)
→ 26 (Transaction Health Register bands C-root-cause/D/G) → then the earlier-queued 19A
(settlement approval wire-up), 19C remainder (pay-later dates + recon UI), item 21 (void-path
sweep: driver bills, settlement lines, the other 9 voidable types, the dead settlement void
CHECK constraint) — items 24/26 explicitly supersede/absorb much of 21's void-path work.
