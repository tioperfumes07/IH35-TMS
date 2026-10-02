# TO: CURSOR — ROUND 326.4 — LEGAL MODULE LINKAGE + B-1h
Claude Lead 2026-10-02 · USMCA only · prod br-fancy-credit-akjnd07a

## MEASURED LIVE — IS LEGAL DONE? NO.
schema legal, 11 tables. matters 18 · contract_templates 80 · contract_instances 4 · signatures 1 ·
contract_audit_log 33 · matter_events 26 · matter_deadlines 6 · matter_documents 1 ·
legal.contract_instance_links = 0 ROWS.
Zero. Not one contract or matter links to a load, driver, unit, trailer, customer, vendor or
settlement. Legal is built and orphaned. Under the linkage law that is not done.

## YOU BUILD, YOU FINISH. NO HANDOFF. ENGINES AND UPGRADES ONLY — NO FEEDING DATA.
1. LINKAGE ENGINE. contract_instance_links becomes real and populated: every contract instance and
   every matter links to its subjects — mdata.customers, mdata.vendors, mdata.drivers, mdata.units,
   mdata.equipment, mdata.loads, identity.users, maintenance.work_orders, accounting.invoices,
   driver_finance settlements, docs.files, org.companies. BOTH directions: contract to subject, and
   the subject's profile back to its contracts and matters.
2. BACKFILL the 4 instances and 18 matters to their real subjects FROM THE SIGNED SOURCE DOCUMENTS.
   Never guess a mapping. If a document does not name the subject, leave it unlinked with a named
   reason. No invented links.
3. ECONOMIC WIRING. Where a matter or contract carries money — settlement, claim, judgment, legal
   fee, retainer, insurance recovery — it posts through the existing expense and invoice engines,
   double-sided and reversible. No handwritten journal entries, no new GL math.
4. DEADLINE AND EXPIRY ENGINE. matter_deadlines and contract expiry drive real dashboard alerts:
   statute dates, renewals, insurance and authority expiry, signature expiry. Silent failure is a defect.
5. SURFACES to the approved preview standard: matter detail, contract detail, signing status, audit
   trail visible to the owner, and a legal block on every customer, vendor, driver and unit profile.
6. LINKAGE DECLARATION in the PR body, both directions.

ALSO CLOSE: B-1h — invoice detail match banner + register check hops for invoice, customer_payment,
bill_payment. You started it after the deploy message; it is not on main.
REPORT: row E2E-2E-95603e75 appears in the USMCA reconciliation. That is a seat fixture in real data
and a law violation. Say where it came from. Do not create more.

TWO PRs (legal, B-1h). GUARD scripts/verify-legal-linkage.mjs — fails if any contract instance or
matter has zero links without a recorded named reason; fails if any legal money row posts outside the
invoice/expense engines.
DEADLINE 2026-10-04 23:00 UTC. Missed = CC-3 takes the surface.
You feed NO data into USMCA for any reason, including proof. No Chrome verification — the owner
walks every screen himself. See 10-02-2026-ALL-CODERS-LAW-UPDATE-CLEAN-APP-NO-VOIDS.md: the app
holds no voids, no cancelled shells, no demo/test/sample data; where a record should not exist it is
DELETED, never voided. Engines first, fully complete per module before anything is called done.

## DONE LINES — paste live output
- legal.contract_instance_links row count > 0, and count of instances/matters with zero links = 0
  (or each with a recorded named reason)
- every legal money row traced to the engine that posted it, double-sided
- B-1h: the banner live on invoice detail and the register hops for all three types
- guard output, 0 violations

# ============================================================================
# CURSOR — YOUR COMPLETE QUEUE, IN SEQUENCE. FINISH ALL 8. NO SKIPPING. NO HANDOFF.
# ============================================================================
Each one FULLY COMPLETE per module before you move: wired, linked, double-routed, reversible,
mechanical + economic + money/finance, linkage declaration in the PR body. You feed NO data.
No Chrome — you do not claim a screen is done because you saw it. Report: what I built · the live
proof · what's next.

 1. LEGAL LINKAGE ENGINE — contract_instance_links from 0 rows to real. Everything above this line.
    2026-10-04 23:00 UTC.
 2. LEGAL BACKFILL — the 4 contract instances and 18 matters to their real subjects, read FROM THE
    SIGNED SOURCE DOCUMENTS. Never guess a mapping. No document naming the subject = leave unlinked
    with a named reason. No invented links. This is reading source documents, not feeding data.
 3. LEGAL ECONOMIC WIRING — settlement, claim, judgment, legal fee, retainer, insurance recovery all
    post through the existing expense and invoice engines, double-sided and reversible. No
    handwritten journal entries, no new GL math.
 4. LEGAL DEADLINE + EXPIRY ENGINE — matter_deadlines and contract expiry drive real dashboard
    alerts: statute dates, renewals, insurance and authority expiry, signature expiry. Silent
    failure is a defect.
 5. LEGAL SURFACES + PROFILE BLOCKS — matter detail, contract detail, signing status, audit trail
    visible to the owner, and a legal block on every customer, vendor, driver and unit profile.
 6. B-1h — invoice detail match banner + register check hops for invoice, customer_payment,
    bill_payment. You started it after the deploy message; it is not on main. Land it.
 7. EIGHT MISSING SUB-NAV TABS — banking, drivers, maintenance. CC-1 found these failing
    build-typecheck on main and routed them to you. Build them.
 8. G-15 · TWO OWNER-FILE MAPPING ERRORS, PDF-CONFIRMED. load 13526 maps to settlement 5779 (the
    owner file says 5772) and load 13607 maps to 5813 (the owner file says 5816). The signed PDFs
    and the app agree with each other. The SPREADSHEET is what is wrong — correct nothing in the
    system. Write the correction note to the bus so the owner can fix his sheet.
