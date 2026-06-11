═══════════════════════════════════════════════════════════════
BLOCK OB1 — NAV-HEADER-UNIFY  (kill the legacy 18-tab header)
Option B. EXISTING PAGES → visual preview approved BEFORE code dispatch.
═══════════════════════════════════════════════════════════════

DEFECT (reproduced live)
  /accounting (Home) renders a CLEAN 12-tab header:
    Home · Bills · Expenses · Bill Payment · Invoices · Receive Payment · Settlements
    · Find Transactions · Unmatched/Needs Review · Factoring · Journal Entries · Reports
  BUT /accounting/invoices and /accounting/factoring render a DIFFERENT, BLOATED
  18-tab legacy header that ALSO includes: AR Aging, AP Aging, Collections, Vendors,
  Customers, Multi-entity, Maintenance & shop, Faro CSV import, Factor reconciliation.
  → Two different nav headers for the same module. The sub-pages use an old component.

GOAL
  One shared Accounting nav header (the clean 12-tab version) used by ALL accounting
  sub-pages (/accounting, /accounting/invoices, /accounting/factoring, /accounting/*).
  Tabs that don't belong in Accounting nav are removed from the header (they remain
  reachable via their correct sidebar entries):
    - Vendors, Customers → their own sidebar tabs (#17, #18). Remove from acct header.
    - Maintenance & shop → Maintenance sidebar (#6). Remove from acct header.
    - AR Aging, AP Aging, Collections, Multi-entity, Faro CSV import, Factor
      reconciliation → these are factoring/AR-AP detail views: move them to be
      SUB-tabs of the pages they belong to (e.g. Factor reconciliation + Faro CSV
      import live UNDER Factoring; AR/AP Aging under Reports or their own views),
      NOT top-level accounting header tabs.

TO THE CODER
  git checkout main && git pull origin main && npm install
  git checkout -b feat/ob1-nav-header-unify
  - Find the two header components: the clean one used by /accounting and the legacy
    one used by /accounting/invoices + /accounting/factoring. (Search the accounting
    feature dir for the tab/nav config arrays.)
  - Make every accounting sub-page import/render the SINGLE clean shared header
    (likely the sidebar-config-driven one). Delete/retire the legacy header component.
  - Re-home the misplaced tabs per GOAL above (Vendors/Customers/Maint removed from
    header; AR/AP Aging, Collections, Multi-entity, Faro CSV import, Factor
    reconciliation become sub-tabs of their proper parent page).
  - NO behavior change to the destinations themselves — only WHERE the tab lives.
  - NO migration. UI/routing only.
  PREVIEW FIRST: render a before/after of the unified header for Jorge's approval
  BEFORE dispatching code (existing-page visual change).
  verify-ob1-nav-header-unify.mjs: assert only ONE accounting header component remains;
  assert the removed tabs are no longer in the accounting header config.
  Push BLOCK_ID=OB1-NAV-HEADER-UNIFY, ls-remote, PR. Report PR# + SHA.
