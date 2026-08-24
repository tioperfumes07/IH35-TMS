/**
 * HOMEPAGE LIVE SCENARIO TRACKER §4.1 — the static REGISTRY.
 *
 * This file holds the IDENTITY of each hop/scenario and nothing else: key, title, lane, the JE text,
 * the spec reference, and which live sources it depends on. Identity does not go stale, so it may
 * live in code.
 *
 * NO STATUS LIVES HERE. That is the entire point of the rewrite: the old board read
 * docs/audit/program-scoreboard.json — a committed snapshot generated once by parsing a markdown
 * ledger — so it kept showing green long after the truth moved. Every dot is computed by a live
 * predicate at request time (see ./probes/), never read from a file or from this array.
 */

export type ScenarioLane = "screens" | "money" | "audit";

/**
 * The ONE shared live predicate for a slice.
 *
 * The certifier (scripts/scenario-certify.mjs) and the request-time read path MUST evaluate the same
 * SQL. If each kept its own copy they would drift, and the board's whole promise — that a green dot
 * means the predicate holds right now — would quietly become "a green dot means some other query once
 * held". So the SQL lives here, once, and both callers execute it.
 *
 * Contract: `$1::uuid` is the entity (NULL = all entities) and the query returns exactly one row with
 * a single column `n`. Tables lacking operating_company_id (mdata.load_stops, docs.file_links) scope
 * through their parent load instead — verified against prod, not assumed.
 */
export type ScenarioProbe = {
  sql: string;
  /** Renders the measured count into the evidence string a human reads on the dot. */
  describe: (n: number) => string;
};

export type ScenarioDefinition = {
  /** Stable key, also the audit.scenario_status.scenario_key. */
  key: string;
  title: string;
  lane: ScenarioLane;
  /** What starts this hop in the real world. */
  trigger: string;
  /** The journal entry (or "—" when the hop posts nothing). */
  je: string;
  /** Spec/card reference so a dot can be traced back to its requirement. */
  spec_ref: string;
  /** Canonical prod relations this hop's predicate reads — surfaced as source_health. */
  sources: string[];
  /**
   * Count-based live predicate. Present for every slice whose truth is "does real data exist".
   * Absent only where the predicate is not a count (hop.revenue reads a feature flag through the
   * shared resolver) — those stay hand-implemented in the service.
   */
  probe?: ScenarioProbe;
};

/** `n > 0` is the predicate for every count probe; kept in one place so both callers agree. */
export function probeHolds(n: number): boolean {
  return n > 0;
}

/**
 * The 9-hop walking skeleton, in the order a real load travels it. Book → deliver read
 * mdata.loads: confirmed canonical (docs/trackers/FINAL-TABLES-WIRING-FOR-CODER labels it
 * "(canonical)", dispatch.loads does not exist on prod, and 73 FKs point at mdata.loads).
 */
export const SCENARIO_REGISTRY: ScenarioDefinition[] = [
  {
    key: "hop.book",
    title: "Book the load",
    lane: "screens",
    trigger: "Dispatcher books a load with a customer and a rate",
    je: "— (proforma invoice is a non-posting projection)",
    spec_ref: "WIRE-01",
    sources: ["mdata.loads", "accounting.invoices"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM mdata.loads l
         WHERE l.customer_id IS NOT NULL
           AND l.rate_total_cents > 0
           AND l.soft_deleted_at IS NULL
           AND ($1::uuid IS NULL OR l.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} load(s) booked with a customer and a rate`,
    },
  },
  {
    key: "hop.assign",
    title: "Assign driver / unit",
    lane: "money",
    trigger: "Driver and unit assigned to the booked load",
    je: "— (driver bill is a payable artifact, not a posting)",
    spec_ref: "WIRE-02 / ACCT-F63",
    sources: ["driver_finance.driver_pay_rates", "driver_finance.driver_bills"],
    probe: {
      // A driver bill priced from the RATE CARD, never equal to the customer rate (ACCT-F63).
      //
      // ACCT-F5783 — the JOIN's ON-clause used to AND-embed the entity scope directly
      // (`AND l.operating_company_id = $1::uuid`), which is NOT NULL-tolerant: every caller invokes
      // this probe with $1=NULL for the all-entities read (see this file's ScenarioProbe contract
      // comment), and `l.operating_company_id = NULL::uuid` evaluates to NULL, so the whole ON
      // predicate went NULL and the INNER JOIN matched zero rows — masking all 6 real qualifying
      // driver bills (live-verified: 4 USMCA + 2 TRANSP) behind a permanent false "0". Fixed by
      // joining on load_id alone and moving entity scoping into the WHERE clause with the same
      // NULL-tolerant form the sibling b.operating_company_id filter already uses.
      sql: `
        SELECT count(*)::text AS n
          FROM driver_finance.driver_bills b
          JOIN mdata.loads l ON l.id = b.load_id
         WHERE b.status <> 'void'
           AND b.rate_per_mile_cents IS NOT NULL
           AND b.gross_amount_cents <> l.rate_total_cents
           AND ($1::uuid IS NULL OR b.operating_company_id = $1::uuid)
           AND ($1::uuid IS NULL OR l.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} driver bill(s) priced from the rate card, not the customer rate`,
    },
  },
  {
    key: "hop.dispatch",
    title: "Dispatch → in transit",
    lane: "screens",
    trigger: "Load status moves to in-transit",
    je: "—",
    spec_ref: "WIRE-06",
    sources: ["mdata.loads"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM mdata.loads l
         WHERE l.status::text IN ('dispatched','in_transit','at_delivery','delivered',
                                  'delivered_pending_docs','completed_docs_received','invoiced','paid','closed')
           AND l.soft_deleted_at IS NULL
           AND ($1::uuid IS NULL OR l.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} load(s) dispatched or beyond`,
    },
  },
  {
    key: "hop.deliver",
    title: "Deliver",
    lane: "screens",
    trigger: "Final active delivery stop departs",
    je: "—",
    spec_ref: "WIRE-07",
    sources: ["mdata.load_stops", "mdata.loads"],
    probe: {
      // load_stops has no operating_company_id — scope through the parent load (verified on prod).
      sql: `
        SELECT count(*)::text AS n
          FROM mdata.load_stops s
          JOIN mdata.loads l ON l.id = s.load_id
         WHERE s.actual_departure_at IS NOT NULL
           AND s.stop_type = 'delivery'
           AND ($1::uuid IS NULL OR l.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} delivery stop(s) with a captured departure`,
    },
  },
  {
    // KEY RENAMED from 'hop.evidence' to 'hop.pod_bol' (GAP-B). The frontend registry has always used
    // hop.pod_bol, so the two never bound and this dot could not go live no matter what the data said.
    // The design label is "POD + BOL", so the FE key is the one kept.
    key: "hop.pod_bol",
    title: "POD + BOL evidence",
    lane: "screens",
    trigger: "Driver captures POD / BOL",
    je: "—",
    spec_ref: "WIRE-03 / WIRE-09",
    // CLS-ORPHAN-SURFACE 2026-08-07 — this probe read ONLY docs.file_links, which is not where a
    // captured POD or a generated BOL lands. The canonical stores are dispatch.pod_documents (written
    // by POST /api/v1/driver/loads/:loadId/stops/:stopId/pod, the signature-capture flow the driver
    // actually uses) and dispatch.bol_documents (POST .../bol/generate) — and those two are exactly
    // what the office reads back at GET /api/v1/dispatch/loads/:loadId/pod-bol, rendered by
    // LoadBolPanel. So the dot measured a different table from the one the product writes and reads,
    // and could not have gone green from a real POD capture no matter how many were taken.
    //
    // The docs-library arm is KEPT rather than replaced: a POD/BOL scanned into the document library
    // and linked to the load is genuine evidence too. It MUST carry the canonical `pod` or `bol` file
    // category; counting every load-linked file turns driver-instruction PDFs into fake POD/BOL proof.
    // UNION ALL over the three stores, so the count is "pieces of POD/BOL evidence attached to a load".
    //
    // Both dispatch tables carry operating_company_id directly; file_links does not, so that arm still
    // takes its entity scope from the parent load. archived_at IS NULL matches the read endpoint's own
    // predicate — an archived POD is not evidence the screen will show.
    sources: [
      "dispatch.pod_documents",
      "dispatch.bol_documents",
      "docs.files",
      "docs.file_links",
      "catalogs.file_categories",
      "mdata.loads",
    ],
    probe: {
      sql: `
        SELECT count(*)::text AS n FROM (
          SELECT p.id
            FROM dispatch.pod_documents p
           WHERE p.archived_at IS NULL
             AND ($1::uuid IS NULL OR p.operating_company_id = $1::uuid)
          UNION ALL
          SELECT b.id
            FROM dispatch.bol_documents b
           WHERE b.archived_at IS NULL
             AND ($1::uuid IS NULL OR b.operating_company_id = $1::uuid)
          UNION ALL
          SELECT fl.id
            FROM docs.file_links fl
            JOIN docs.files f ON f.id = fl.file_id
            JOIN catalogs.file_categories fc ON fc.id = f.category_id
            JOIN mdata.loads l ON l.id = fl.entity_id
           WHERE fl.entity_type = 'load'
             AND fl.deleted_at IS NULL
             AND f.deleted_at IS NULL
             AND fc.code IN ('pod', 'bol')
             AND ($1::uuid IS NULL OR l.operating_company_id = $1::uuid)
        ) evidence
      `,
      describe: (n) => `${n} POD/BOL document(s) linked to a load`,
    },
  },
  {
    // ACCT-F5782 — this dot had NO probe at all (unlike every sibling hop.*/scenario.*), so it always
    // rendered "no count probe (resolved at request time)" no matter what the data said: a structural
    // never-measured state, not a genuine failure. The delivery revenue latch this hop actually
    // describes (event 1 of DISP-01, revrec-delivery-posting/poster.service.ts) is a SEPARATE feature
    // from the read-only ASC-606 "revenue-contracts" preview in revenue-recognition.routes.ts (which
    // has no POST route and posts nothing) — verified by reading both files so the probe measures the
    // right thing. Traced the real posting table (accounting.load_revenue_recognition_postings) and
    // confirmed live on prod it has genuinely posted: 9 standing 'earn' events for USMCA
    // (5c854333-6ea5-4faa-af31-67cb272fef80), 1 for TRANSP (91e0bf0a-133f-4ce8-a734-2586cfa66d96).
    // "Standing" here mirrors standingLatchJePredicate (poster.service.ts) exactly: the posting itself
    // is not voided AND its linked JE is not voided/reversed — a reversed latch must not count as
    // revenue still on the books.
    key: "hop.revenue",
    title: "Revenue recognition latch",
    lane: "money",
    trigger: "Delivery evidence exists and the entity flag is ON",
    je: "DR Unbilled Revenue / CR Line-Haul Income",
    spec_ref: "WIRE-05",
    sources: ["lib.feature_flag_overrides", "accounting.load_revenue_recognition_postings", "accounting.journal_entries"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM accounting.load_revenue_recognition_postings r
         WHERE r.event = 'earn'
           AND r.voided_at IS NULL
           AND EXISTS (
             SELECT 1 FROM accounting.journal_entries je
              WHERE je.id = r.journal_entry_id
                AND je.operating_company_id = r.operating_company_id
                AND je.voided_at IS NULL
                AND je.reversed_by_je_id IS NULL
           )
           AND ($1::uuid IS NULL OR r.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} standing revenue-recognition latch posting(s)`,
    },
  },
  {
    key: "hop.invoice",
    title: "Invoice + evidence gate",
    lane: "money",
    trigger: "POD received; proforma converts and sends",
    je: "DR A/R / CR Unbilled Revenue",
    spec_ref: "WIRE-04 / ACCT-F61",
    sources: ["accounting.invoices", "audit.audit_events"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM accounting.invoices i
         WHERE i.voided_at IS NULL
           AND i.status::text IN ('sent','partial','paid')
           -- TMS-NATIVE ONLY: 11,976 of 11,984 invoices are QuickBooks clones. Counting them would
           -- certify the TMS invoice flow green on work the TMS never performed.
           AND i.qbo_invoice_id IS NULL
           AND ($1::uuid IS NULL OR i.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} live invoice(s) sent or paid`,
    },
  },
  {
    key: "hop.gl",
    title: "GL / JE balanced",
    lane: "money",
    trigger: "Postings land in the ledger",
    je: "Balanced double entry (DR = CR)",
    spec_ref: "WIRE-08",
    sources: ["accounting.journal_entries"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM accounting.journal_entries je
         WHERE je.reversed_by_je_id IS NULL
           -- Verified on prod: all 1,787 JEs carry source_system='tms' (no QBO-cloned JEs), so this is
           -- genuinely our posting engine's output. Stated explicitly so a future import cannot start
           -- silently inflating it.
           AND je.source_system = 'tms'
           AND ($1::uuid IS NULL OR je.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} live journal entr(ies)`,
    },
  },
  {
    key: "hop.bank",
    title: "Bank path",
    lane: "money",
    trigger: "Customer payment matched and categorized",
    je: "DR Cash / CR A/R",
    spec_ref: "WIRE-10",
    sources: ["banking.bank_transactions"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM banking.bank_transactions bt
         WHERE bt.matched_invoice_id IS NOT NULL
           AND bt.is_credit = true
           AND ($1::uuid IS NULL OR bt.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} customer payment(s) matched to an invoice`,
    },
  },
  {
    key: "scenario.customer",
    title: "New customer onboarding",
    lane: "screens",
    trigger: "A customer is created and credit-checked",
    je: "—",
    spec_ref: "LST/CUST",
    sources: ["mdata.customers"],
    probe: {
      sql: `
        SELECT count(*)::text AS n FROM mdata.customers c
         WHERE c.qbo_customer_id IS NULL  -- TMS-NATIVE ONLY (2,689 of 2,696 are QBO clones)
           AND ($1::uuid IS NULL OR c.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} customer(s) on file`,
    },
  },
  {
    key: "scenario.driver_onboarding",
    title: "New driver onboarding",
    lane: "screens",
    trigger: "Driver hired, qualified and activated",
    je: "—",
    spec_ref: "DRV-ONBOARD",
    sources: ["mdata.drivers", "mdata.driver_company_authorizations", "safety.onboarding_sessions"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM safety.onboarding_sessions s
          JOIN mdata.drivers d
            ON d.id = s.driver_id
           AND (
             d.operating_company_id = s.operating_company_id
             OR EXISTS (
               SELECT 1
                 FROM mdata.driver_company_authorizations dca
                WHERE dca.driver_id = d.id
                  AND dca.company_id = s.operating_company_id
                  AND dca.is_authorized = true
                  AND dca.deactivated_at IS NULL
             )
           )
         WHERE ($1::uuid IS NULL OR s.operating_company_id = $1::uuid)
           AND s.status = 'completed'
           AND s.current_step = 7
           AND s.completed_at IS NOT NULL
           AND (
             (
               s.step_data ?& ARRAY[
                 'identity', 'cdl_upload', 'medical_card', 'dqf_docs',
                 'signatures', 'i9', 'vehicle_assignment'
               ]
             )
             OR (
               s.admin_override = true
               AND NULLIF(BTRIM(s.admin_override_reason), '') IS NOT NULL
             )
           )
           AND d.status = 'Active'
           AND d.archived_at IS NULL
           AND d.deactivated_at IS NULL
           AND d.hire_date IS NOT NULL
           AND NULLIF(BTRIM(d.cdl_number), '') IS NOT NULL
           AND NULLIF(BTRIM(d.cdl_state), '') IS NOT NULL
           AND d.cdl_expires_at >= CURRENT_DATE
           AND d.dot_medical_expires_at >= CURRENT_DATE
      `,
      describe: (n) => `${n} qualified driver onboarding chain(s) completed`,
    },
  },
  {
    key: "scenario.coa",
    title: "Chart of accounts",
    lane: "money",
    trigger: "Accounts seeded / imported per entity",
    je: "—",
    spec_ref: "COA",
    sources: ["catalogs.accounts"],
    probe: {
      sql: `
        SELECT count(*)::text AS n FROM catalogs.accounts a
         WHERE a.qbo_account_id IS NULL  -- TMS-NATIVE ONLY (1,295 of 1,442 are QBO clones)
           AND ($1::uuid IS NULL OR a.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} account(s) in the chart`,
    },
  },
  {
    key: "scenario.settlement",
    title: "Driver settlement",
    lane: "money",
    trigger: "Settlement period closes and pays the driver",
    je: "DR Driver Pay / CR Net Pay Clearing",
    spec_ref: "SETTLE",
    sources: ["driver_finance.driver_settlements", "driver_finance.payrun_gl_runs", "accounting.journal_entries"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM driver_finance.driver_settlements s
         WHERE ($1::uuid IS NULL OR s.operating_company_id = $1::uuid)
           AND s.voided_at IS NULL
           AND s.reversed_at IS NULL
           AND (
             s.status = 'paid'
             OR s.paid_at IS NOT NULL
             OR s.payment_state IN ('paid', 'cleared')
           )
           AND EXISTS (
             SELECT 1
               FROM driver_finance.payrun_gl_runs pr
               JOIN accounting.journal_entries je
                 ON je.id = pr.journal_entry_id
                AND je.operating_company_id = pr.operating_company_id
                AND je.status = 'posted'
                AND je.voided_at IS NULL
              WHERE pr.settlement_id = s.id
                AND pr.operating_company_id = s.operating_company_id
                AND pr.status = 'posted'
           )
      `,
      describe: (n) => `${n} paid settlement(s) closed through a posted pay-run JE`,
    },
  },
  {
    key: "scenario.advance",
    title: "Driver advance / loan",
    lane: "money",
    trigger: "Advance issued to a driver",
    je: "DR Driver Cash Advance (asset) / CR Cash",
    spec_ref: "ADV",
    sources: ["driver_finance.driver_advances", "accounting.posting_batches", "accounting.journal_entry_postings", "accounting.journal_entries"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM driver_finance.driver_advances a
         WHERE ($1::uuid IS NULL OR a.operating_company_id = $1::uuid)
           AND a.driver_id IS NOT NULL
           AND a.disbursement_status = 'disbursed'
           AND a.disbursed_at IS NOT NULL
           AND EXISTS (
             SELECT 1
               FROM accounting.posting_batches pb
               JOIN accounting.journal_entry_postings jep
                 ON jep.posting_batch_id = pb.id
                AND jep.operating_company_id = pb.operating_company_id
                AND jep.source_transaction_type = 'driver_advance'
                -- PROGRAM-TRACKER-F08: source_transaction_id is text (polymorphic-source column,
                -- not always a uuid), a.id is uuid -- comparing them bare threw "operator does
                -- not exist: text = uuid", which poisoned the whole scenario-tracker request's
                -- shared transaction and cascaded a false "unreachable" STALE banner onto every
                -- other probe that ran after this one on the same connection. Cast the uuid
                -- side, not the text side, so this stays correct if source_transaction_id ever
                -- holds a non-uuid source id for another source_transaction_type.
                AND jep.source_transaction_id = a.id::text
               JOIN accounting.journal_entries je
                 ON je.id = jep.journal_entry_uuid
                AND je.operating_company_id = jep.operating_company_id
                AND je.status = 'posted'
                AND je.voided_at IS NULL
              WHERE pb.operating_company_id = a.operating_company_id
                AND pb.source_transaction_type = 'driver_advance'
                AND pb.source_transaction_id = a.id::text
                AND pb.batch_status = 'posted'
           )
      `,
      describe: (n) => `${n} disbursed driver advance(s) posted to the GL`,
    },
  },
  {
    key: "scenario.deductions",
    title: "Settlement deductions",
    lane: "money",
    trigger: "Deduction applied against a settlement",
    je: "DR Net Pay Clearing / CR the deduction account",
    spec_ref: "DEDUCT",
    sources: ["driver_finance.driver_settlement_deductions", "driver_finance.settlement_lines", "driver_finance.driver_settlements", "driver_finance.payrun_gl_runs", "accounting.journal_entries"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM driver_finance.driver_settlement_deductions d
          JOIN driver_finance.driver_settlements s
            ON s.id = d.applied_to_settlement_id
           AND s.operating_company_id = d.operating_company_id
           AND s.voided_at IS NULL
           AND s.reversed_at IS NULL
         WHERE ($1::uuid IS NULL OR d.operating_company_id = $1::uuid)
           AND d.status = 'applied'
           AND d.is_held = false
           AND EXISTS (
             SELECT 1
               FROM driver_finance.settlement_lines sl
              WHERE sl.settlement_id = s.id
                AND sl.line_type = 'deduction'
                AND sl.is_active = true
                AND sl.source_table = 'driver_finance.driver_settlement_deductions'
                AND sl.source_reference_id = d.id
           )
           AND EXISTS (
             SELECT 1
               FROM driver_finance.payrun_gl_runs pr
               JOIN accounting.journal_entries je
                 ON je.id = pr.journal_entry_id
                AND je.operating_company_id = pr.operating_company_id
                AND je.status = 'posted'
                AND je.voided_at IS NULL
              WHERE pr.settlement_id = s.id
                AND pr.operating_company_id = s.operating_company_id
                AND pr.status = 'posted'
           )
      `,
      describe: (n) => `${n} applied settlement deduction(s) included in a posted pay-run JE`,
    },
  },
  {
    key: "scenario.escrow",
    title: "Driver escrow",
    lane: "money",
    trigger: "Escrow withheld / returned",
    je: "DR Net Pay Clearing / CR Driver Escrow (liability)",
    spec_ref: "ESCROW",
    sources: ["accounting.escrow_postings", "accounting.escrow_accounts", "driver_finance.driver_settlements", "accounting.journal_entries"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM accounting.escrow_postings ep
          JOIN accounting.escrow_accounts ea
            ON ea.id = ep.escrow_account_id
           AND ea.operating_company_id = ep.operating_company_id
           AND ea.holder_type = 'driver'
          JOIN driver_finance.driver_settlements s
            ON s.id = ep.source_id
           AND s.operating_company_id = ep.operating_company_id
           AND s.driver_id = ea.holder_id
           AND s.voided_at IS NULL
           AND s.reversed_at IS NULL
          JOIN accounting.journal_entries je
            ON je.id = ep.linked_journal_entry_id
           AND je.operating_company_id = ep.operating_company_id
           AND je.status = 'posted'
           AND je.voided_at IS NULL
         WHERE ($1::uuid IS NULL OR ep.operating_company_id = $1::uuid)
           AND ep.source_type = 'driver_settlement'
           AND ep.posting_type IN ('deposit', 'release')
           AND ep.amount_cents > 0
      `,
      describe: (n) => `${n} driver escrow hold/return event(s) posted to the GL`,
    },
  },
  {
    key: "scenario.ap",
    title: "Expense / bill / AP",
    lane: "money",
    trigger: "Vendor bill entered and paid",
    je: "DR Expense / CR A/P",
    spec_ref: "AP",
    sources: ["accounting.bills"],
    probe: {
      sql: `
        SELECT count(*)::text AS n FROM accounting.bills b
         -- ACCT-F202: voidBill() writes revoked_at, NOT voided_at, so filtering voided_at alone
         -- counted every properly-voided bill as live. Both columns are checked because prod also
         -- holds 4 bills carrying voided_at from an out-of-band write no code path produces.
         WHERE b.revoked_at IS NULL
           AND b.voided_at IS NULL
           AND b.qbo_bill_id IS NULL  -- TMS-NATIVE ONLY (16,245 of 16,250 are QBO clones)
           AND ($1::uuid IS NULL OR b.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} open (non-voided) bill(s)`,
    },
  },
  {
    key: "scenario.fuel",
    title: "Fuel",
    lane: "money",
    trigger: "Fuel pumped on a card / wallet",
    je: "DR Fuel Expense / CR Relay Fuel Wallet",
    spec_ref: "FUEL/CONN-3",
    sources: ["fuel.fuel_transactions"],
    probe: {
      sql: `
        SELECT count(*)::text AS n FROM fuel.fuel_transactions f
         WHERE f.load_id IS NOT NULL  -- all 1,548 rows are CSV-imported (source='other'); the TMS fuel
                                      -- flow is proven only by a fuel txn LINKED to a TMS load
           AND ($1::uuid IS NULL OR f.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} fuel transaction(s)`,
    },
  },
  {
    key: "scenario.maintenance",
    title: "Maintenance work order",
    lane: "money",
    trigger: "WO opened, parts/labor posted, closed",
    je: "DR Repair & Maintenance / CR A/P",
    spec_ref: "MNT",
    sources: ["maintenance.work_orders"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM maintenance.work_orders w
         WHERE ($1::uuid IS NULL OR w.operating_company_id = $1::uuid)
           AND w.status = 'closed'
           AND w.voided_at IS NULL
           AND w.unit_id IS NOT NULL
           AND w.vendor_id IS NOT NULL
           AND w.load_id IS NOT NULL
           AND EXISTS (
             SELECT 1
               FROM maintenance.work_order_lines wol
              WHERE wol.work_order_uuid = w.id
                AND wol.line_type IN ('part', 'parts')
           )
           AND EXISTS (
             SELECT 1
               FROM maintenance.work_order_lines wol
              WHERE wol.work_order_uuid = w.id
                AND wol.line_type = 'labor'
           )
           AND EXISTS (
             SELECT 1
               FROM accounting.bills b
               JOIN accounting.posting_batches pb
                 ON pb.source_transaction_type = 'bill'
                AND pb.source_transaction_id = b.id::text
                AND pb.operating_company_id = b.operating_company_id
                AND pb.batch_status = 'posted'
              WHERE b.linked_work_order_uuid = w.id
                AND b.operating_company_id = w.operating_company_id
                AND b.revoked_at IS NULL
                AND b.voided_at IS NULL
           )
      `,
      describe: (n) => `${n} closed work order chain(s) with parts, labor and posted A/P`,
    },
  },
  {
    key: "scenario.accident",
    title: "Full accident chain",
    lane: "screens",
    trigger: "Accident reported through to claim + cost",
    je: "DR Accident Loss / CR A/P or Escrow",
    spec_ref: "SAF-ACC",
    sources: [
      "safety.accident_reports",
      "safety.accident_cost_lines",
      "insurance.claim",
      "maintenance.work_orders",
      "accounting.bills",
      "accounting.posting_batches",
      "accounting.journal_entry_postings",
      "accounting.journal_entries",
      "driver_finance.driver_liabilities",
    ],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM safety.accident_reports a
          JOIN insurance.claim c
            ON c.id = a.insurance_claim_id
           AND c.accident_report_id = a.id
           AND c.tenant_id = a.operating_company_id
          JOIN maintenance.work_orders w
            ON w.insurance_claim_id = c.id
           AND w.operating_company_id = a.operating_company_id
           AND w.source_type = 'AC'
           AND w.voided_at IS NULL
          JOIN accounting.bills b
            ON b.linked_work_order_uuid = w.id
           AND b.operating_company_id = a.operating_company_id
           AND b.qbo_bill_id IS NULL
           AND b.revoked_at IS NULL
           AND b.voided_at IS NULL
          JOIN accounting.posting_batches pb
            ON pb.source_transaction_type = 'bill'
           AND pb.source_transaction_id = b.id::text
           AND pb.operating_company_id = a.operating_company_id
           AND pb.batch_status = 'posted'
          JOIN accounting.journal_entry_postings jep
            ON jep.posting_batch_id = pb.id
           AND jep.operating_company_id = pb.operating_company_id
           AND jep.source_transaction_type = 'bill'
           AND jep.source_transaction_id = b.id::text
          JOIN accounting.journal_entries je
            ON je.id = jep.journal_entry_uuid
           AND je.operating_company_id = jep.operating_company_id
           AND je.status = 'posted'
           AND je.voided_at IS NULL
         WHERE ($1::uuid IS NULL OR a.operating_company_id = $1::uuid)
           AND a.driver_id IS NOT NULL
           AND a.unit_id IS NOT NULL
           AND a.load_id IS NOT NULL
           AND EXISTS (
             SELECT 1
               FROM safety.accident_cost_lines acl
              WHERE acl.accident_id = a.id
                AND acl.operating_company_id = a.operating_company_id
                AND acl.amount_cents > 0
           )
           AND EXISTS (
             SELECT 1
               FROM driver_finance.driver_liabilities dl
              WHERE dl.operating_company_id = a.operating_company_id
                AND dl.driver_id = a.driver_id
                AND dl.origin = 'safety_accident'
                AND dl.origin_id::text = a.id::text
                AND dl.type = 'accident_damage'
                AND dl.original_amount > 0
                AND dl.status <> 'voided'
           )
      `,
      describe: (n) => `${n} accident claim/cost/repair chain(s) posted to the GL`,
    },
  },
  {
    key: "scenario.insurance",
    title: "Insurance",
    lane: "money",
    trigger: "Policy bound; claim recovery received",
    je: "DR Cash / CR Insurance Recovery",
    spec_ref: "INS",
    sources: ["insurance.policy", "insurance.claim", "accounting.insurance_claim_recovery_postings", "accounting.journal_entries"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM insurance.claim c
          JOIN insurance.policy p
            ON p.id = c.policy_id
           AND p.operating_company_id = c.operating_company_id
           AND p.status = 'active'
           AND p.cancelled_on IS NULL
         WHERE ($1::uuid IS NULL OR c.operating_company_id = $1::uuid)
           AND c.amount_paid_cents > 0
           AND EXISTS (
             SELECT 1
               FROM accounting.insurance_claim_recovery_postings rp
               JOIN accounting.journal_entries je
                 ON je.id = rp.journal_entry_id
                AND je.operating_company_id = rp.operating_company_id
                AND je.status = 'posted'
                AND je.voided_at IS NULL
              WHERE rp.claim_id = c.id
                AND rp.operating_company_id = c.operating_company_id
                AND rp.status = 'posted'
                AND rp.is_active = true
                AND rp.voided_at IS NULL
           )
      `,
      describe: (n) => `${n} active-policy claim recovery chain(s) posted to the GL`,
    },
  },
  {
    key: "scenario.legal",
    title: "Legal + civil fine",
    lane: "money",
    trigger: "Matter opened; fine assessed or paid",
    je: "DR Civil Fines Expense / CR Cash Clearing",
    spec_ref: "LEGAL",
    sources: ["legal.matters"],
    probe: {
      sql: `
        SELECT count(*)::text AS n FROM legal.matters m WHERE ($1::uuid IS NULL OR m.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} legal matter(s)`,
    },
  },
  {
    key: "scenario.factoring",
    title: "Factoring",
    lane: "money",
    trigger: "Invoice factored; advance funded",
    je: "DR Cash + Fees / CR Factoring Advance (liability)",
    spec_ref: "FACTOR",
    sources: ["accounting.factoring_advances"],
    probe: {
      sql: `
        SELECT count(*)::text AS n FROM accounting.factoring_advances fa WHERE ($1::uuid IS NULL OR fa.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} factoring advance(s)`,
    },
  },
  {
    key: "scenario.banking",
    title: "Banking / reconciliation",
    lane: "money",
    trigger: "Bank line categorized and reconciled",
    je: "DR/CR per the categorized account",
    spec_ref: "BANK-RECON",
    sources: ["banking.bank_transactions"],
    probe: {
      sql: `
        SELECT count(*)::text AS n FROM banking.bank_transactions bt WHERE bt.categorized_at IS NOT NULL AND ($1::uuid IS NULL OR bt.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} categorized bank transaction(s)`,
    },
  },
  {
    key: "scenario.breakdown_relay",
    title: "Breakdown + replacement truck",
    lane: "screens",
    trigger: "In-transit breakdown, WO opened, replacement unit assigned to the same load",
    je: "Roadside bill posts DR Repair / CR A/P (see scenario.roadside_ap)",
    spec_ref: "COMPLICATED-BATTERY-01",
    sources: ["dispatch.intransit_issues", "dispatch.load_assignment_history", "maintenance.work_orders", "mdata.loads"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM dispatch.intransit_issues i
          JOIN dispatch.load_assignment_history h ON h.load_id = i.load_id
         WHERE i.promoted_to_wo_id IS NOT NULL
           AND i.unit_id IS NOT NULL
           AND h.previous_unit_id IS NOT NULL
           AND h.new_unit_id IS NOT NULL
           AND h.previous_unit_id <> h.new_unit_id
           AND ($1::uuid IS NULL OR i.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} load(s) with in-transit WO + unit swap (replacement truck)`,
    },
  },
  {
    key: "scenario.trailer_swap",
    title: "Trailer hook / drop mid-load",
    lane: "screens",
    trigger: "Trailer changed on an in-progress load",
    je: "—",
    spec_ref: "COMPLICATED-BATTERY-02",
    sources: ["dispatch.load_assignment_history", "mdata.loads"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM dispatch.load_assignment_history h
         WHERE h.previous_trailer_id IS NOT NULL
           AND h.new_trailer_id IS NOT NULL
           AND h.previous_trailer_id <> h.new_trailer_id
           AND ($1::uuid IS NULL OR h.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} mid-load trailer swap(s)`,
    },
  },
  {
    key: "scenario.roadside_ap",
    title: "Roadside tow / repair AP on the load",
    lane: "money",
    trigger: "Vendor bill from the in-transit WO",
    je: "DR Repair / CR A/P",
    spec_ref: "COMPLICATED-BATTERY-03",
    sources: ["accounting.bills", "maintenance.work_orders", "dispatch.intransit_issues"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM accounting.bills b
          JOIN maintenance.work_orders w ON w.id = b.linked_work_order_uuid
         WHERE b.qbo_bill_id IS NULL
           AND b.voided_at IS NULL
           AND b.revoked_at IS NULL
           AND EXISTS (
             SELECT 1 FROM dispatch.intransit_issues i
              WHERE i.promoted_to_wo_id = w.id
           )
           AND ($1::uuid IS NULL OR b.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} TMS-native roadside bill(s) linked to an in-transit WO`,
    },
  },
  {
    key: "scenario.parts_receive",
    title: "Receive parts inventory onto a WO",
    lane: "money",
    trigger: "Parts purchase receipt (optional WO consume)",
    je: "DR Inventory / CR A/P when parts GL flag ON",
    spec_ref: "COMPLICATED-BATTERY-04",
    sources: ["maintenance.parts_purchases", "maintenance.parts_inventory"],
    probe: {
      sql: `
        SELECT count(*)::text AS n
          FROM maintenance.parts_purchases p
         WHERE p.voided_at IS NULL
           AND ($1::uuid IS NULL OR p.operating_company_id = $1::uuid)
      `,
      describe: (n) => `${n} live parts receipt(s)`,
    },
  },
];

export const SCENARIO_KEYS = SCENARIO_REGISTRY.map((s) => s.key);

/** Every distinct source across the registry — the source_health probe set. */
export const ALL_SOURCES: string[] = Array.from(
  new Set(SCENARIO_REGISTRY.flatMap((s) => s.sources))
).sort();
