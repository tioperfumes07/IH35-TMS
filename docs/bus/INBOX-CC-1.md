# INBOX-CC-1 · 2026-09-04 · Cursor lead · OWNER ESCALATION — LOAD COSTS, EVERY ASPECT
`git pull --ff-only origin main`

★★ OWNER CORRECTIONS 2026-09-04 17:00 — read these BEFORE touching Load Costs. You
keep asking the same money questions; here are the settled answers (skill §4 +
owner today). STOP re-asking. VERIFY WITH NEON (a real row), never Chrome-click —
a click proves nothing without a real transaction.

1. MONEY MODEL — driver is a COMPANY DRIVER (Mexican B1), NOT an owner-operator
   (accounting skill §4). Therefore:
   - We almost NEVER send a fuel advance to a driver. When the COMPANY does advance
     the driver money for diesel, that is a COMPANY EXPENSE (not an owner-op fuel
     advance/receivable). Book it as an expense.
   - Broker pattern A: the BROKER sends US a cash advance for the driver's diesel →
     we pass it to the driver, and the broker DEDUCTS it from the invoice (nets
     against that load's A/R — reduces what the broker pays us). Not our expense.
   - Broker pattern B: the broker sends the DRIVER money directly → we record it as
     a BILL PAYMENT to the driver. Not company revenue, not our fuel advance.
   Do NOT model owner-operator fuel advances. Do NOT re-ask this.

2. LOAD COSTS COLUMNS (owner's latest exact set — additive to the board spec below):
   expense columns Late Fee · Lumper · Fuel · R&M Exp (roadside OR repairs incurred
   on the trip). Driver/miles side: a Short Miles column AND next to it an Empty
   Miles column = the deadhead-miles payment. Keep everything already specified.

3. THE "DRAFT" BUG — VERIFIED LIVE (Cursor, Neon br-fancy-credit-akjnd07a 2026-09-04):
   USMCA has EXACTLY ONE load — 13508, status='draft', is_sample_data=false (REAL).
   The board is correctly displaying the DB status; the ROOT defect is that 13508 is
   STUCK in 'draft' though it is a real booked load — the Book flow never advanced
   its status. FIX: diagnose why booking did not move it off draft and make real
   booked loads render on the board. Do NOT "filter drafts" into an empty board —
   the owner needs to add costs to THIS load. NEVER POST Book Load yourself; the
   owner advances it — but the wiring must make the advance stick + the board show it.

4. FARO FACTORING — owner instruction: auto-assign FARO to ALL customers right now
   (factoring is UN-HELD for this specific task). Wire it so every customer defaults
   to FARO; prove the assignment with a Neon read.

5. SCOPE — we are NOT reconciling, NOT matching bank transactions, and NEVER mixing
   TRK/TRANSP with USMCA data. We are fixing, wiring, and VERIFYING everything works;
   real EXPENSES WILL BE CREATED (owner-entered, real USMCA rows — you build the
   path, the owner enters; no seat fixtures).

6. DEPLOY — owner wants the entire updated Load Costs deployed (fresh Render) once
   built. Backend deploy srv-d7rpem7avr4c73fhp4n0 + git_sha proof after a green merge.


★ LEAD NOTE 2026-09-04 16:47 — (1) STOP the driver-liabilities detour at your
current atomic item and make LOAD COSTS (below) your #1 — this is the owner's
direct escalation today. (2) The 39/19/47/7 counts you couldn't source in USMCA
are TRANSPORTATION/TRUCKING (frozen, do-not-read) — you were RIGHT to flag not
absorb; ignore them, USMCA only. (3) CC-3's `driver_samsara_links` migration SQL
(sent to you) is SECONDARY — apply it in your migration lane (00–11 UTC) AFTER
Load Costs is proven, not before. Do not let it preempt Load Costs.

★★ OWNER DIRECTIVE (2026-09-04, verbatim intent): "CC-1 needs to FULLY BUILD in
every aspect ALL that is related to LOAD COSTS." This is your #1 job. Do not move
to anything else until Load Costs is complete top-to-bottom on a LIVE load in
Chrome and DEPLOYED. §0 Finish Law: one vertical, finished, before the next.

"Every aspect" = the WHOLE Load Costs surface, not just the board columns:

1. DATA / SCHEMA
   - Every money column on mdata.loads (or the canonical cost hub) exists in
     PRODUCTION with correct types (cents, integer), NOT NULL where required,
     defaults sane. Prove with an information_schema read pasted from prod.
   - RLS FORCED + entity-scoped on every touched table; audit row on every write.
   - Void = reversal, never delete. Opening balances $0. Capitalize threshold $7,000.

2. BACKEND RULE / POSTER (reuse the existing poster — never write new GL math solo)
   - Revenue, Late Fee, Lumper, Fuel, R&M Exp, Other, Loaded Pay, Deadhead Pay,
     Gross — computed from REAL posted rows, cents-correct, three-date-correct
     (incurred drives margin/P&L; due drives payables aging; paid drives recon —
     a payment clears a liability and NEVER adds cost to a load).
   - Gross = Revenue − (all expense buckets + driver pay). Show the arithmetic;
     no magic number. Short Miles / Empty Miles from the mileage source, not typed.
   - On Time = REAL delivered date vs projected/appointment date (derived flag).

3. ENDPOINT
   - One scoped endpoint feeds BOTH the board (quick per-trip line) and the
     detailed cost drawer (LoadDetailCostsTab). LIVE loads only — drafts filtered
     OUT at the query (owner: a draft must never appear on the board).

4. SCREEN — WIRED, two surfaces:
   (a) LOAD COSTS BOARD — quick expense line. Owner's exact column set, in order:
       Load · Unit · Driver · PU Date · Del Date · Revenue · Late Fee · Lumper ·
       Fuel · R&M Exp · Other · Short Miles · Rate Loaded · Loaded Pay ·
       Empty Miles · Rate Empty · Deadhead Pay · Gross · On Time
       - PU Date = PROJECTED pickup (entered at Book Load). Del Date = REAL
         delivered date. Two different date semantics — do NOT conflate.
       - NO Status column. NO Category column. LIVE loads only.
       - Empty Miles / Deadhead Pay BLANK (not zero) when unknown.
       - GLOBAL-TYPE-SIZE-BASELINE: 12px body, 11px/700/UPPERCASE centered sortable
         headers, values centered, 2px radius, $-right/number-tabular. Open the doc
         before any size/color/width. Never invent a scale.
   (b) DETAILED COST DRAWER (LoadDetailCostsTab, your granted SURFACE-BREACH) — the
       full breakdown behind the board line: each expense linked to its vendor/bill,
       each pay line to the driver settlement, revenue to the customer invoice.

5. LINKAGE (Blueprint §9 — the bar for "done", forward AND reverse, on LIVE data):
   - Every money number links to a vendor OR customer + the GL account it posts to
     + an audit record.
   - Every cost links to its load/dispatch and the driver/unit/asset involved.
   - Cross-module: a fuel/R&M cost → unit + vendor + WO (G18) + expense acct + JE;
     a driver-pay line → the settlement; revenue → the customer invoice.
   - Forward + reverse drill-through: click any number → land on the source row →
     click back → return. NO dead-end screen, NO orphan number, NO built-but-unwired
     poster/route/sub-account.

6. GUARD + verify-step (same PR, your band ≡1 mod 4; Rule 37 claim→merge→author for
   any numbered verify-step). Guard the column set, the drafts-excluded filter, the
   Gross arithmetic, and the forward/reverse link contract.

7. PROOF (Rule 16 / evidence-before-done): the owner is entering the FIRST live loads
   by hand right now and wants to SEE real costs. "Merged" is NOT "done." Paste:
   - the prod information_schema read (columns exist),
   - the live board read for a REAL load (real Revenue/Gross, not fixtures),
   - the drill-through both ways,
   - backend deploy: after a green backend merge, trigger srv-d7rpem7avr4c73fhp4n0
     ONCE and prove git_sha at /api/v1/healthz/shallow == the squash SHA.
   NO seat fixtures in prod, ever. Every USMCA row REAL unless is_sample_data=true.
   Never POST Book Load. Never Chrome-drive a create.

DELIVER as vertical slices, FAST-MERGE each (4-min loop), deploy on the cadence —
but the ITEM is not closed until §5 linkage is proven both ways on a live load.

---
SECONDARY (only after Load Costs is fully built + proven, or in a freed migration lane):
  - matched-state DB CHECK (bank_transactions_matched_requires_matched_id) — apply
    in your migration lane (CC-1 hours 00–11 UTC).
  - Real defect (A) settlement-sample-tag — LIVE PROD INSERT missing a required tag;
    find the INSERT, confirm no-seat-fixture / is_sample_data / NOT-NULL violation,
    fix at the write path + guard, prove on prod. NOT rot — do not baseline away.
  - Real defect (B) accident-liabilities VOID — the money-reversal side (correct
    reversing JE, not a delete). CC-3 wires the FE caller; you own the reversal.

Never POST. Never Chrome-drive creates.

ACK `CC-1 | ACK | LOAD COSTS every-aspect vertical (schema→poster→endpoint→board+drawer→§5 linkage→guard→live proof→deploy) is #1; secondary items after · NEVER POST | GO`
