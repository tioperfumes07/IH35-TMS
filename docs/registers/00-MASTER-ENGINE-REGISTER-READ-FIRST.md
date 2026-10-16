# MASTER ENGINE REGISTER — IH35-TMS / USMCA
# Consolidated 2026-10-16. Supersedes the three source registers it merges.

Sources merged, newest wins on conflict:
  2026-10-16  banking match engine, measured live by Lead (this session)
  2026-10-12  load wiring map, gaps G1-G15 (main 4963e69f)
  2026-10-03  engine audit + banking defect register B1-B11

READ ORDER FOR A NEW AGENT — do not write code before all four:
  1. CLAUDE.md (repo root)
  2. claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md
  3. THIS FILE
  4. docs/audit/BANKING-MATCH-FLOW-AUDIT.md  (only if touching banking/match)
Quote one line from each before writing anything.

---

# PART 1 — HOW THE ENGINES MUST FUNCTION (the design, not the bug list)

## 1.1 ONE ENGINE PER SURFACE
Every surface has exactly one engine and a guard that enforces it. Never
write a second matcher, poster, or writer "just for this case". If an
engine does not cover your case, extend the engine.

  Match surface       apps/backend/src/accounting/bank-recon/match.service.ts
                      guard: verify-one-match-engine-owns-this-surface.mjs
  Posting             the posting engine is the ONLY writer of
                      accounting.journal_entry_postings
                      guard: verify-only-the-posting-engine-writes-postings.mjs
                      (10 legacy services still INSERT directly; shrink-only
                      allowlist, 0 new permitted)
  Expense documents   the shared expense writer. Never a private INSERT.
  Bill documents      the bill poster. Dr item account / Cr A/P with vendor.

## 1.2 MATCH vs CATEGORIZE — the QuickBooks split
  MATCH      = link the bank line to an EXISTING document. NO new journal
               entry. The document already carries the accounting.
  CATEGORIZE = a NEW journal entry posted straight from the bank line.
               NO document is created. A categorized line CARRIES A VENDOR,
               exactly as QuickBooks does.
  Source: docs/specs/qbo-parity/CHAIN-05-BANK-FEED-POSTING-DESIGN.md:236
  Never build a bank-line-to-expense-document path for categorize.

  Posting matrix (CHAIN-05:75-82), plus row A' added 2026-10-08:
    A   money-OUT  expense account        Dr expense / Cr bank
    A'  money-OUT  liability or equity    Dr liability|equity / Cr bank
    B   money-IN   income                 Dr bank / Cr income
    B'  money-IN   liability              Dr bank / Cr liability
    C   transfer   own bank account       no P&L, not auto-posted in v1
    D   money-OUT  driver advance         bank-driver-advance.service.ts
  Categorizing to A/R or A/P control accounts from the bank feed is
  DISALLOWED (CHAIN-05:237).
  Re-categorize and re-match reverse through reversePostedSourceTransaction,
  NEVER the void path (CHAIN-05:130).

## 1.3 NEVER AUTO-MATCH
findCandidates() is READ-ONLY. It suggests and ranks; it persists nothing.
The owner accepts every match by hand. Three guards enforce this:
  verify-no-automatch.mjs
  verify-bank-match-is-never-auto-written.mjs
  verify-banking-suggest-matches-wired.mjs
Never add auto-accept. Never put matching in a cron.
Bulk accept is permitted ONLY on 100% identical lines — same amount, same
date, same payee. Anything less comes up unticked for the owner.

## 1.4 THE CANDIDATE UNIVERSE IS EVERY DOCUMENT
Owner ruling 2026-09-30, superseding the earlier settlement-only scope:
the bank-match candidate universe is EVERY document the company creates —
AR invoices, receive-payments, deposits, ordinary vendor expenses, bills,
bill payments, transfers, journal entries, factoring purchases. Narrowing
it is the defect.

## 1.5 EVERY RECORD LANDS ON ITS LOAD
A bank line, a fuel fill, an expense, a bill, a posting — if it belongs to
a load, it carries load_id. Not a tag, not a memo: the foreign key, and the
load-spine number. "That is the design of the system, less work, more
efficient" (owner, 2026-10-12).

## 1.6 ONE FUEL-TO-LOAD RULE
The load the UNIT was running at the fill time — actual arrival/departure
first, then GPS stamps, driver as fallback. One helper, used by both the
import path and the bank-match path. Never two rules.

## 1.7 FUEL COSTED AS CONSUMED, NOT PURCHASED
Assigning fuel to the load that bought it distorts margin. Each load must
carry its real fuel cost on DRIVEN miles, not practical miles. Geofence
entry records date, time and unit mileage, and suggests that mileage when
the fuel expense is created. Company settlements carry initial and ending
mileage.

## 1.8 REEFER FUEL IS ITS OWN ACCOUNT AND ITS OWN ITEM
The government refunds a credit on reefer gallons, so they must be detailed
separately. Not a categorization of regular diesel.

## 1.9 NO JOURNAL ENTRIES AS A TOOL
Every money movement is a DOCUMENT whose own engine writes the ledger, or a
categorized bank line. A manual JE is the last resort — never a way to
correct a balance, clear an account, or make two numbers agree. No plugs.

## 1.10 VOID AND DELETE
Void = reversal, DR=CR preserved. But where a record should never have
existed, it is DELETED outright — the posting, its journal entry and its
lines — so the ledger never carried it. A reversing entry that leaves two
dead entries is "a void by another name" and is rejected. The ledger must
still balance after.

## 1.11 CASH BASIS, DUAL REPORTING
The books operate on CASH basis: documents hit the GL when matched to a
bank transaction, not on their transaction date. Reporting must produce
BOTH cash and accrual, following QuickBooks' design. Both basis engines
must work fully. An expense sitting unposted pending a bank match is the
design working, not a defect.

---

# PART 2 — OPEN ENGINE DEFECTS, MEASURED

## 2.1 BANKING MATCH — measured live 2026-10-16

ENGINE LOCATION
  apps/backend/src/accounting/bank-recon/match.service.ts
    findCandidates()                    :842-932   READ-ONLY
    fetchLedgerCandidates()             :337-541   the union
    computeMatchScore()
    acceptMatchWithResolveDifference()  :934-1041+
  Route  apps/backend/src/banking/p7-wave2.routes.ts:175-214
  UI     apps/frontend/src/pages/banking/components/MatchDrawer.tsx
  Audit  docs/audit/BANKING-MATCH-FLOW-AUDIT.md

M1 — CANDIDATES COME FROM OTHER BANK ACCOUNTS.  OPEN.
  In match.service.ts the string bank_account_id appears in the candidate
  SQL exactly ONCE, in the deposits branch:
      WHERE d.operating_company_id = $1::uuid
        AND d.bank_account_id = $6::uuid
        AND d.deposit_date BETWEEN $2::date AND $3::date
  Every other source is scoped by operating_company_id and date ONLY.
  Nothing ties a candidate to the bank account the line belongs to, so
  every document in the company on any account is offered.
  FIX: scope each branch of fetchLedgerCandidates() to the bank line's
  bank account, the way the deposits branch already does. A missing
  predicate, not a rewrite.

M2 — NO FACTORING PURCHASES, NO INVOICES.  OPEN.
  The union has SIX sources and neither is among them:
      accounting.payments          (money-in only)
      accounting.bill_payments
      accounting.bills             (open-balance only)
      accounting.expenses
      banking.transfers            (direction-scoped)
      accounting.journal_entries   (both directions)
  Confirmed by p7-wave2.routes.ts's own header comment and by the repo
  audit doc. Invoices and factoring purchases were NEVER in the union.
  This contradicts the 2026-09-30 ruling in 1.4 above — recorded, never
  built.
  FIX: add the missing sources, direction-aware, scoped per M1.

M3 — TWO MATCHERS ON ONE SURFACE.  OPEN. (= B5/B8/B9 of 10-03)
  MatchDrawer.tsx ALREADY HAS multi-document match (one bank line -> many
  documents) and Resolve-difference with named difference accounts, built
  in ROUND 189/206. The register renders its OWN inline candidate table and
  its own source comment says it outright: "the orphaned MatchDrawer.tsx
  ... DISPLAY ONLY here". The owner is looking at the poorer of two.
  FIX: Categorize/Match opens the drawer as a MODAL. One change closes
  three owner items — "in QuickBooks it is a popup", multi-select, and
  Resolve difference — and removes the competing numbers above and below
  the row.

M4 — BANK-RECON IDEMPOTENCY KEYED ON A MEMO STRING.  OPEN. BLOCKS PURGE.
  recon-adjustments.service.ts:103 and :266 interpolate a session uuid
  into the operator-facing memo. :116 then uses
  WHERE memo = $2 AND total_amount_cents = $3 as the IDEMPOTENCY KEY.
  Live: 2 journal entries + 1 expense carry
  "Bank reconciliation interest earned - session 7a7d1da9-...".
  Cannot simply be cleaned: strip the uuid and two sessions' $25 charges
  collide and the second is silently swallowed. The expense posts as
  source_transaction_type "expense", so the memo is currently the ONLY
  link back to its session.
  FIX, IN THIS ORDER:
    1. structured link on the spine (accounting.transaction_source_links)
    2. re-key idempotency onto that link
    3. only then make the memo human:
       "Bank reconciliation service charge - 09/30/2025"

M5 — MATCH-CANDIDATE FILTERS DEAD ON SCREEN.  OPEN, downstream of M3.
  Amount from / Amount to are ALREADY WIRED end to end
  (banking.ts:597-598 -> p7-wave2.routes.ts:215-216). kinds is already a
  multi-select on the wire. If the boxes do nothing, it is the orphaned
  surface (M3), not missing plumbing. Do not add a second patch.

## 2.2 LOAD / DOCUMENT WIRING — gaps G1-G15, measured 2026-10-12 on main 4963e69f

P0
G1  Book Load + Edit Load must REQUIRE the trailer choice (company /
    customer+number -> loads.trailer_source + non_owned_trailer_id / no
    trailer). Today book-load.service.ts never writes trailer_source or
    non_owned_trailer_id; only printed-trailer-decision.service.ts:53,77
    does.
G2  Settlement Creator trailer at birth — the draft's trailer NUMBER is
    resolved to an id at settlement-creator.service.ts:917 AFTER the loads
    are booked (seed :399 passes raw draft.trailer_id; routes :310,
    service :2173). Resolve BEFORE ensureDispatchedLoadsForCreator; a
    customer trailer -> non_owned. Also pass load_trailer_equipment_id
    from the document (reefer vs dry van) — today EVERY Creator load is
    DRY_VAN (book-load :445-457).
G3  Creator customer fallback — seed-loads :53-66 falls back to the
    company's OLDEST ACTIVE CUSTOMER when the name does not match. Wrong
    customer silently = wrong A/R. REFUSE with the unmatched name; the
    owner picks or creates the customer. Audit the 148 existing loads for
    any whose customer came from that fallback and report.
G4  Creator "owed" company-expense bill (service :1577-1610) is not
    GL-posted, its id is not kept, not voided on Edit, not on the load
    spine. Post through the bill poster (Dr item account / Cr A/P with
    vendor), keep the id, void on Edit, number on the spine.
G5  Creator lines written with NO load: reimbursements (:1681-1699 — the
    draft line HAS load_number), additional pay (:1769), reimbursable
    expense lines (:1708), fuel line whose typed load is not found
    (:1207, :1324). All must carry the load — resolved by number, else the
    load the driver was on that day — or REFUSE. Unit optional at
    routes :54 must become required, from the load.
G6  A bank line with NO document must still land on its load.
    banking/categorization.routes.ts:460 only TAGS the load;
    posting-engine :2796-2845 posts with no load_id. "Categorize to load"
    must CREATE the expense document through the shared expense writer
    (load-spine number, driver/unit/trailer from the load, item ->
    account, posted with load_id). The canonical/Dreamline fuel fill
    posted at bank match (bank-match-fuel-post.service.ts :57-152) must
    create its fuel expense document the same way.
    bank-line-expense.service.ts:96 numbers EXP- even when there is a
    load -> must use the spine.

P1
G7  ONE fuel-to-load rule. Import uses resolveLoadId
    (fuel-transaction-import.ts :312-351: scheduled +/-1 day, exactly one
    match, actual times ignored); Relay at match uses loadAtTimeSql
    (bank-match-fuel-post :154-175). Both must call ONE helper: the load
    the unit was running at fill time (actual arrival/departure first, GPS
    stamps), driver fallback. fuel_transactions gets trailer too.
G8  Every posting carries load_id when its document has a load — fuel
    postings (poster.service.ts :352 has class only), factoring postings,
    cash-advance JE lines (posting-engine :2547-2561, also driver entity),
    bank-categorization postings. ONE rule in the posting writer: load_id
    + entity from the source document.
G9  driver_finance.driver_bills has no unit / trailer columns — add and
    stamp at mint (book-load :1326-1368) from the load. Cash advance takes
    unit/trailer from the LOAD, not the request body
    (cash-advance-create.ts :358, Creator :1515-1529). Overflow loan id
    kept and voided on Edit (CA :239-265 vs Creator :1533).
G10 Invoice itemized from dispatch.load_charge_lines — line haul, fuel
    surcharge, each accessorial as its own line with its item -> income
    account — instead of one linehaul for rate_total_cents
    (from-load.ts :307-352). Accessorial/lumper lines get item_id
    (:445-457).
G11 Geofences at booking — the stop insert (book-load :3261) never writes
    geocode_precision, so bindLoadToGeofences (:3331) binds nothing until
    the cron. Write precision from the resolver at insert. The load-stop
    fences the detector reads (geofence-detector :219,238) are the ones
    pushed to Samsara. Load status follows fence evidence: first pickup
    departure -> in_transit; final delivery arrival ->
    delivered_pending_docs (invoicing still waits on BOL/POD).
G12 Fuel duplicate rule contradiction — preflight tells the operator to
    type <ticket>-<load> (settlement-creator-preflight :62) but the post
    strips the suffix and refuses (fuel-provider-reference.ts :21-24).
    ONE rule: base invoice = one purchase; the preflight shows the
    existing load instead of suggesting the suffix.
G13 Creator company expenses (service :1620-1651) skip the shared expense
    writer — no expense_load_links, no duplicate check. Call the shared
    writer.
G14 Deductions all post as "other" to 7200 (:1860). Map by deduction type
    — admin fee / toll / fine / damage / escrow — to its item and account.
G15 Lumper advance records a $0 "expense JE HOLD"
    (cash-advance-create :422-425). Post it through the expense writer on
    the load (Dr lumper item account / Cr the advance source); a lumper
    billable to the customer becomes an invoice line.

## 2.3 ENGINE STATE — from the 2026-10-03 audit

FIXED
  Fuel posting -> 1090. The cash path resolved its credit account to
    Undeposited Funds via a name-ordered fallback; it now resolves the
    operating_bank ROLE or throws. Merge 3e1061bbcb, deploy
    dep-db0mik5a1vls739a5ht0.
  P&L completeness. Two implementations were silently dropping unmapped
    account types; both now surface an "unclassified" section, excluded
    from gross profit and net income.
  Account-type homes. Guard fails if an account type with postings has no
    P&L or balance-sheet home. Passing live.
    verify-every-account-type-has-a-pl-or-bs-home.mjs
  Posters resolve by role. Every poster resolves its account through the
    role table, not a hard-coded number or name. Gates the purge.

PINNED / RATCHETED — shrink only, never grow
  Posting engine single-door: 10 services still INSERT postings directly
    while 87 call the engine.
    verify-only-the-posting-engine-writes-postings.mjs
  Duplicates: baseline 11 duplicate groups / 22 rows.
    verify-no-live-duplicate-documents.mjs
  Swallowed DB errors: 122 real in 82 files.
    verify-no-swallowed-db-error-in-transaction.mjs

OPEN / NOT STARTED
  Bank-recon idempotency on a memo string (M4) — BLOCKS THE PURGE
  Bill provenance: 0 of 93 USMCA bills carry linked_work_order_uuid and
    all 93 have source = NULL. Sub-tabs (Maintenance/Repair/Fuel/Driver)
    are filtered by a REGEX OVER MEMO TEXT, not lineage. Blocked on data,
    not code — the WRITERS MUST STAMP PROVENANCE FIRST. Any filter fix
    before that is a guess dressed as a filter.
  Multi-select app-wide: MultiSelectDropdown used in 12 files of 1,215.
  Breadcrumbs: Breadcrumb.tsx used in 7 of 1,215 page files.
  Natural-sign rendering: no implementation found.
  QBO text / number / calendar formats app-wide: not started.
  Palette: unselected boxes must stop being pure white. Collides with
    verify-section7-palette-financial.mjs, which freezes the current
    palette — it is a tokens-file change plus a guard baseline change made
    TOGETHER, never a per-component edit.

INFRASTRUCTURE BLOCKER (2026-10-03, re-verify before trusting any guard)
  155 guards authored and never wired into CI, against a ceiling of 93.
  Roughly sixty guards everyone believes are protecting this system have
  never executed once. Same class of problem as a screen that reports
  safety while doing nothing. Re-measure before relying on a guard name.

---

# PART 3 — STANDING LAW FOR THE AGENT

SCOPE
  USMCA ONLY — 5c854333-6ea5-4faa-af31-67cb272fef80
  TRANSPORTATION 91e0bf0a-133f-4ce8-a734-2586cfa66d96  FROZEN
  TRUCKING       b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e  FROZEN
  Never read, write, count or report on a frozen entity. A number that
  includes frozen-entity rows is a violation, not a finding. A vendor API
  key is a credential, not an entity.

PRODUCTION
  Neon project tiny-field-89581227, branch br-fancy-credit-akjnd07a.
  Entity reads REQUIRE SET LOCAL app.bypass_rls = 'lucia' as the FIRST
  statement in a transaction. An empty result without it means nothing.
  EMPTY IS A QUESTION, NOT AN ANSWER — check the entity, the filter, the
  RLS bypass, the join and the spelling before reporting anything missing.

DATA
  NOBODY SEEDS DATA — not the Lead, not any seat, not for a test, not for
  proof, in any entity. The owner runs every ingestion himself. Every
  USMCA record is REAL unless it carries is_sample_data = true.
  WE DO NOT TOUCH SAMSARA. Nothing deleted, no name changed. One app
  profile per driver, many Samsara profiles and usernames.
  No migration without an AUTH number the OWNER gave in chat.

AUTHORITY
  1. Jorge's words in chat
  2. docs/specs/ in this repo
  3. live production
  4. current code on main
  NOT authoritative: your memory, a pattern from another module, a
  claude/ doc written by an agent (including a Lead), an AUTH-### number,
  another seat's reported number.
  If a Lead instruction contradicts docs/specs/, THE SPEC WINS. Quote the
  spec line and stop.
  If the blueprint does not cover it, STOP AND ASK. An unanswerable
  question is a FINDING, not a blocker you solve yourself.

NO NEW SURFACES
  Add no box, field, column, page, table, route, tab, card or KPI that was
  not explicitly requested. Delete nothing unless Jorge said "remove X".
  If you believe a new surface is needed: NAME IT AND STOP.

PROOF
  Never report done without the live row, the live query or the guard
  output PASTED. Every fix ships a guard PROVEN RED on the pre-fix tree —
  paste the RED output — then GREEN. A proof command that cannot fail is
  worse than no proof.
  Gate on npm run -s build, frontend AND backend, plus the guard suite.
  NOT tsc -p --noEmit; it misses unused imports and has killed three
  deploys.
  NEVER block a merge on Chrome verification. The owner walks every
  screen. Linkage is proved by query — FK present, join returns rows,
  posting carries the right account_id — never by a screenshot.

REPLY SHAPE
  the quotes proving you read - what I did - the proof it is real, pasted
  - what is next. Nothing else.

---
END OF REGISTER
