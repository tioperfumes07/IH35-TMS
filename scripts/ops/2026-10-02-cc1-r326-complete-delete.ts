/**
 * ROUND 326 (CC-1) — COMPLETE DELETE ENGINE. Owner law 2026-10-02 (docs/bus/10-02-2026-ALL-CODERS-LAW-UPDATE-CLEAN-APP-
 * NO-VOIDS.md): a record that should never have existed is DELETED with everything that hangs off it — no void, no
 * reversal pair, no shell — and the ledger still balances (DR = CR, 0 unbalanced JEs).
 *
 * SCOPES (USMCA 5c854333-… only; every root query carries the company filter):
 *   --scope=transportation21  the 21 IH 35 TRANSPORTATION loads booked under USMCA (docs/bus/10-02-2026-CC-1-…):
 *                             the loads, their revrec latch rows + JEs (+ reversals), their invoices.
 *   --scope=usmca-clean       is_sample_data = true rows, E2E / demo / test identifiers, voided documents, cancelled
 *                             load shells, settlement docref 5819 (named by the owner order), legal seat-fixture
 *                             matters/instances (SAMPLE/TEST/CASCADE/CODEX/CC3-VERIFY patterns — Cursor ROUND 326
 *                             clean-app leftover). Docrefs 5817 / 5818 are EXCLUDED by name (unidentified, not void
 *                             — they stay for the owner).
 *
 *   --scope=zero-reset        ROUND 326 queue item 22 — THE ZERO-RESET: every created document and transaction of the
 *                             company (loads, dispatch, stops, driver bills, settlements + lines, A/P bills + payments,
 *                             invoices + lines, advances, reimbursements, deductions, every expense incl. fuel / DEF /
 *                             tolls, every JE + posting). MASTER DATA SURVIVES UNTOUCHED (customers, drivers, vendors,
 *                             locations, units, trailers, equipment, chart of accounts, items, pay rate templates,
 *                             factors, users): a master / preserve / identity / catalog table that would be touched is a
 *                             BLOCKER. Bank lines are KEPT — their links into deleted documents are cleared and they go
 *                             back to the categorization queue. Refuses unless the preservation engine (CC-3, preserve.*)
 *                             has recorded its rows. After the delete, in the same transaction, it PROVES: GL postings 0,
 *                             every deleted table 0 for the company, master-data counts unchanged. Owner-run only.
 *
 * HOW (no hand-typed child list — the live FK graph decides): starting from the roots, every row that references a
 * collected row through a foreign key is collected too, recursively (pg_constraint, single-column FKs). The plan
 * prints each table and count; a SET NULL / multi-column reference to a collected row is reported, never silently
 * nulled. APPLY lists every WORM row in _system.purge_authorized_rows for the AUTH (ARM L, migration 202615210200),
 * records every row in audit.record_deletions (what + why), deletes leaves first in ONE transaction, then proves:
 * the roots are gone and DR = CR with 0 unbalanced JEs. Any refusal rolls the whole thing back.
 *
 * ALLOW_BANK_EFFECT=1 (APPLY only, with the AUTH naming it) permits a delete that moves a bank GL balance.
 * RUN:  DRY (default, read-only, no AUTH):  DATABASE_URL=<read-only ok> npx tsx scripts/ops/2026-10-02-cc1-r326-complete-delete.ts --scope=transportation21
 *       APPLY: OWNER_AUTH_ID=AUTH-NNN APPLY=1 DATABASE_URL=<prod neondb_owner> npx tsx … --scope=…
 * The engine feeds no data: it only deletes what the owner ordered deleted.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.env.APPLY === "1";
const AUTH_ID = (process.env.OWNER_AUTH_ID ?? "").trim();
// A delete that moves a bank GL balance is refused unless the AUTH explicitly covers it (e.g. the $1.00 test-expense chain
// whose re-reversed reversal left the bank GL $1.00 short of the real bank).
const ALLOW_BANK_EFFECT = process.env.ALLOW_BANK_EFFECT === "1";
const SCOPE = (process.argv.find((a) => a.startsWith("--scope=")) ?? "").slice("--scope=".length);
// ROUND 390 (Lead, 2026-10-04) — the purge DRY RUN the owner approves from: with --r390-gates the zero-reset plan also
// prints, per table, what stands between the plan and an actual delete (absolute WORM -> RETAINED and named; the
// accounting.refuse_financial_row_delete arm that admits it under an owner AUTH; live documents that must be VOIDED
// first; whether ih35_app has any DELETE policy). Read-only. The live path is a separate, held change.
const R390_GATES = process.argv.includes("--r390-gates");
const TRANSPORTATION_21 = ["13485", "13487", "13493", "13494", "13496", "13500", "13498", "13502", "13503", "13504", "13505", "13506", "13507", "13509", "13517", "13522", "13525", "13530", "13531", "13533", "13539"];
const KEEP_DOCREFS = ["5817", "5818"];
const TEST_ID = String.raw`(^|[^a-z])(e2e|demo|test|sample|fixture|practice|example)([^a-z]|$)`;
const NEVER_RECURSE = new Set(["audit.record_deletions", "audit.row_changes", "audit.audit_events", "_system.purge_authorized_rows"]);
// Rows that BELONG to a deleted record (they cannot outlive it) — the cascade follows only these. Anything else that
// references the deleted set is an INDEPENDENT record (a settlement covering several loads, a bank line, a vendor
// bill): it is REPORTED as a blocker for a per-row decision, never deleted by inference.
const OWNED = new Set([
  "mdata.load_stops", "dispatch.load_assignment_history", "dispatch.load_cancellations", "dispatch.load_charge_lines",
  "dispatch.load_eta_predictions", "dispatch.stop_arrivals", "dispatch.stop_extra_rates", "dispatch.auto_status_suggestions",
  "dispatch.notify_log", "geo.geofence_state_transitions", "integrations.auto_status_switch_events",
  "expense_attribution.expense_load_links", "expense_attribution.expense_seq_per_load",
  "accounting.invoice_lines", "accounting.invoice_disputes", "accounting.journal_entry_postings", "accounting.transaction_source_links",
  "accounting.load_revenue_recognition_postings", "accounting.revenue_contracts", "accounting.ar_collection_tasks",
  "docs.file_links", "driver_finance.presettlement_link_suggestions", "driver_finance.historical_settlement_attribution_items",
  // Legal seat-fixture cascade (clean-app): events/deadlines/docs/links die with the matter/instance.
  "legal.matter_events", "legal.matter_deadlines", "legal.matter_documents", "legal.contract_instance_links",
  "legal.contract_audit_log", "legal.signatures",
]);
// A document's postings reference it by text id (source_transaction_type + source_transaction_id) with no FK — the
// 2026-09-30 purge deleted 1,091 expenses and their invoices but left 2,035 JEs behind (A/P overstated $2,976.63).
// Deleting a document ALWAYS takes the JEs that post for it.
const DOC_SOURCE: Record<string, string[]> = {
  "accounting.expenses": ["expense"], "accounting.invoices": ["invoice"], "accounting.bills": ["bill"],
  "accounting.bill_payments": ["bill_payment"], "accounting.payments": ["payment", "customer_payment"],
  "driver_finance.driver_settlements": ["driver_settlement"], "mdata.loads": ["load"], "accounting.factoring_advances": ["factoring_advance"],
};
const WORM = new Set(["accounting.journal_entries", "accounting.journal_entry_postings", "accounting.invoices", "accounting.invoice_lines"]);
// ROUND 326 queue item 22 — zero-reset roots (every row of the company), master data that must survive, bank lines kept.
const ZERO_RESET_ROOTS = [
  "mdata.loads", "accounting.journal_entries", "accounting.bills", "accounting.bill_payments", "accounting.invoices", "accounting.payments",
  "accounting.expenses", "accounting.factoring_advances", "accounting.credit_memos", "accounting.vendor_credits", "accounting.broker_advances",
  "accounting.company_settlements", "accounting.deposits", "driver_finance.driver_bills", "driver_finance.driver_settlements",
  "driver_finance.settlement_lines", "driver_finance.driver_advances", "driver_finance.driver_reimbursements",
  "driver_finance.driver_settlement_deductions", "driver_finance.driver_liabilities", "fuel.fuel_transactions",
];
const ZERO_RESET_DELETE_SCHEMAS = new Set(["accounting", "driver_finance", "dispatch", "fuel", "expense_attribution", "factoring", "docs", "geo", "integrations", "legal", "telematics", "maintenance"]);
const MASTER_TABLES = [
  "mdata.customers", "mdata.drivers", "mdata.vendors", "mdata.locations", "mdata.units", "mdata.equipment",
  "catalogs.accounts", "catalogs.items", "identity.users", "org.companies", "banking.bank_accounts",
];
const PRESERVED_SCHEMAS = new Set(["identity", "org", "catalogs", "preserve", "audit", "_system", "lib", "mdata", "banking"]);
const RESET_TABLES = new Set(["banking.bank_transactions"]);
// ROUND 359 — a row with NO company is invisible to every "WHERE operating_company_id = $1" in this engine: it would be
// neither collected nor counted in the proof, and the reset would report success over leftover line detail (measured
// 2026-10-03, unscoped: expense_lines 506, bill_lines 28, dispatch.load_charge_lines 136). In a delete schema such a row
// is collected ("row escaped its company") and the proof requires zero left. In a preserved schema it is NEVER deleted:
// a table whose NULL company MEANS "shared by every company" is reported as kept, with its reason; any other is a BLOCKER.
const ESCAPED_REASON = "ROUND 326 zero-reset: row escaped its company";
const SHARED_BY_DESIGN: Record<string, string> = {
  "audit.row_changes": "audit of company-less tables", "audit.scenario_status": "global scenario status",
  "audit.record_deletions": "deletion record of shared rows", "catalogs.detail_types": "QuickBooks detail-type catalog shared by all companies",
  "identity.role_permissions": "global role -> permission map", "identity.user_permissions": "a NULL-company grant applies in every company",
  "lib.feature_flag_overrides": "a NULL-company override applies to every company", "outbox.queue": "system outbox jobs",
  "public.audit_log": "legacy system audit log", "archive.round258_purge_event_costs": "frozen archive",
  "archive.round258_purge_lost_opportunity": "frozen archive", "archive.round266_purge_event_costs": "frozen archive",
};
async function companyColumnTables(c: Q): Promise<string[]> {
  return (await c.query<{ t: string }>(
    `SELECT c.table_schema || '.' || c.table_name AS t FROM information_schema.columns c
       JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
      WHERE c.column_name = 'operating_company_id' AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY 1`
  )).rows.map((r) => r.t);
}
function zeroResetPreserved(table: string): boolean {
  if (table === "mdata.loads" || table === "mdata.load_stops") return false;
  if (RESET_TABLES.has(table)) return false;
  return PRESERVED_SCHEMAS.has(table.split(".")[0]) || !ZERO_RESET_DELETE_SCHEMAS.has(table.split(".")[0]) || MASTER_TABLES.includes(table)
    || /(^|\.)(pay_rate|driver_pay_rate|factors?$|factor_)/.test(table);
}
// bank = a bank line kept and sent back to the queue; unlink = a non-master operational row's nullable link cleared;
// rows = a child with no single-column primary key, deleted by its foreign key (before its parent).
type ResetRef = { table: string; col: string; vals: string[]; kind: "bank" | "unlink" | "rows" };
const RESETS: ResetRef[] = [];
const ESCAPED_REPORT: string[] = [];
function isMasterOrPreserve(table: string): boolean {
  const schema = table.split(".")[0];
  if (table === "mdata.loads" || table === "mdata.load_stops") return false;
  return MASTER_TABLES.includes(table) || ["identity", "org", "catalogs", "preserve", "audit", "_system", "lib", "mdata"].includes(schema)
    || /(^|\.)(pay_rate|driver_pay_rate|factors?$|factor_)/.test(table);
}
function pushReset(r: ResetRef) {
  if (!RESETS.some((x) => x.table === r.table && x.col === r.col && x.kind === r.kind && x.vals.length === r.vals.length)) RESETS.push(r);
}

type Q = { query: <T = Record<string, unknown>>(sql: string, v?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };
type Plan = Map<string, Set<string>>; // table -> primary-key values
type Fk = { child: string; childCol: string; parent: string; parentCol: string; onDelete: string; childPk: string | null; cols: number; nullable?: boolean; childCol2?: string | null; parentCol2?: string | null };

function add(plan: Plan, table: string, ids: string[], why: Map<string, string>, reason: string) {
  const s = plan.get(table) ?? new Set<string>();
  let n = 0;
  for (const id of ids) if (id && !s.has(id)) { s.add(id); n++; why.set(`${table}:${id}`, reason); }
  plan.set(table, s);
  return n;
}

async function ids(c: Q, sql: string, v: unknown[] = []): Promise<string[]> {
  return (await c.query<{ id: string }>(sql, v)).rows.map((r) => String(r.id));
}

async function roots(c: Q, plan: Plan, why: Map<string, string>) {
  if (SCOPE === "transportation21") {
    const loads = await ids(c, `SELECT id::text AS id FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = ANY($2::text[])`, [USMCA, TRANSPORTATION_21]);
    add(plan, "mdata.loads", loads, why, "ROUND 326: IH 35 TRANSPORTATION load booked under USMCA (owner order 2026-10-02)");
    add(plan, "accounting.load_revenue_recognition_postings", await ids(c, `SELECT id::text AS id FROM accounting.load_revenue_recognition_postings WHERE operating_company_id = $1::uuid AND load_id = ANY($2::uuid[])`, [USMCA, loads]), why, "revenue recognized on a TRANSPORTATION load");
    const jes = await ids(c, `SELECT journal_entry_id::text AS id FROM accounting.load_revenue_recognition_postings WHERE operating_company_id = $1::uuid AND load_id = ANY($2::uuid[])`, [USMCA, loads]);
    add(plan, "accounting.journal_entries", jes, why, "revenue JE of a TRANSPORTATION load");
    add(plan, "accounting.invoices", await ids(c, `SELECT id::text AS id FROM accounting.invoices WHERE operating_company_id = $1::uuid AND source_load_id = ANY($2::uuid[])`, [USMCA, loads]), why, "invoice of a TRANSPORTATION load");
    return;
  }
  if (SCOPE === "usmca-clean") {
    const sampleTables = (await c.query<{ t: string }>(
      `SELECT c.table_schema || '.' || c.table_name AS t FROM information_schema.columns c
         JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.column_name = 'is_sample_data'
          AND EXISTS (SELECT 1 FROM information_schema.columns o WHERE o.table_schema = c.table_schema AND o.table_name = c.table_name AND o.column_name = 'operating_company_id')
          AND EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = c.table_schema AND k.table_name = c.table_name AND k.column_name = 'id')`
    )).rows.map((r) => r.t);
    for (const t of sampleTables) add(plan, t, await ids(c, `SELECT id::text AS id FROM ${t} WHERE operating_company_id = $1::uuid AND is_sample_data IS TRUE`, [USMCA]), why, "is_sample_data = true (no demo / test / sample in USMCA)");
    const voided: Array<[string, string]> = [
      ["accounting.invoices", "voided_at IS NOT NULL"], ["accounting.expenses", "voided_at IS NOT NULL"], ["accounting.journal_entries", "voided_at IS NOT NULL"],
      ["driver_finance.driver_settlements", "voided_at IS NOT NULL"], ["accounting.bills", "voided_at IS NOT NULL"], ["accounting.payments", "voided_at IS NOT NULL"],
      ["accounting.load_revenue_recognition_postings", "(voided_at IS NOT NULL OR NOT is_active)"],
    ];
    for (const [t, pred] of voided) add(plan, t, await ids(c, `SELECT id::text AS id FROM ${t} WHERE operating_company_id = $1::uuid AND ${pred}`, [USMCA]), why, "voided record (no voids in the app)");
    add(plan, "mdata.loads", await ids(c, `SELECT id::text AS id FROM mdata.loads WHERE operating_company_id = $1::uuid AND (status::text = 'cancelled' OR load_number ~* $2)`, [USMCA, TEST_ID]), why, "cancelled load shell / test identifier");
    add(plan, "mdata.customers", await ids(c, `SELECT id::text AS id FROM mdata.customers WHERE operating_company_id = $1::uuid AND customer_name ~* $2`, [USMCA, TEST_ID]), why, "test identifier");
    add(plan, "driver_finance.driver_settlements", await ids(c, `SELECT id::text AS id FROM driver_finance.driver_settlements WHERE operating_company_id = $1::uuid AND source_document_ref = '5819'`, [USMCA]), why, "settlement docref 5819 (owner order: cancelled, no PDF)");
    // Cursor ROUND 326 clean-app leftover: legal seat fixtures (SAMPLE/TEST/CASCADE/CODEX/CC3 verify)
    // named in OUTBOX as pending delete — never feed, never void; complete-delete only.
    const LEGAL_FIXTURE = String.raw`(sample|test|cascade|codex|cc3-|e2e|fixture|verify-2026|meter3|scen01|go0031|usmca-wire)`;
    add(
      plan,
      "legal.matters",
      await ids(
        c,
        `SELECT id::text AS id FROM legal.matters
          WHERE operating_company_id = $1::uuid
            AND (
              matter_number ~* $2
              OR coalesce(description, '') ~* $2
              OR coalesce(internal_notes, '') ILIKE '%pending clean-app delete%'
            )`,
        [USMCA, LEGAL_FIXTURE]
      ),
      why,
      "legal seat-fixture matter (clean-app: no SAMPLE/TEST/CASCADE/CODEX in USMCA)"
    );
    add(
      plan,
      "legal.contract_instances",
      await ids(
        c,
        `SELECT id::text AS id FROM legal.contract_instances
          WHERE operating_company_id = $1::uuid
            AND (
              voided_at IS NOT NULL
              OR coalesce(signer_name, '') ~* $2
              OR coalesce(template_code, '') ~* $2
            )`,
        [USMCA, LEGAL_FIXTURE]
      ),
      why,
      "legal seat-fixture / voided contract instance (clean-app)"
    );
    // A cancelled load's revenue goes with it.
    const loads = [...(plan.get("mdata.loads") ?? [])];
    add(plan, "accounting.journal_entries", await ids(c, `SELECT journal_entry_id::text AS id FROM accounting.load_revenue_recognition_postings WHERE operating_company_id = $1::uuid AND load_id = ANY($2::uuid[])`, [USMCA, loads]), why, "revenue JE of a deleted load");
    // Docrefs 5817 / 5818 stay, whatever matched them.
    const keep = await ids(c, `SELECT id::text AS id FROM driver_finance.driver_settlements WHERE operating_company_id = $1::uuid AND source_document_ref = ANY($2::text[])`, [USMCA, KEEP_DOCREFS]);
    for (const k of keep) plan.get("driver_finance.driver_settlements")?.delete(k);
    return;
  }
  if (SCOPE === "orphan-postings") {
    // JEs that post for a document that no longer exists (the ledger must never carry a line without its document).
    for (const [table, types] of Object.entries(DOC_SOURCE)) {
      add(plan, "accounting.journal_entries", await ids(c,
        `SELECT DISTINCT p.journal_entry_uuid::text AS id FROM accounting.journal_entry_postings p
          WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = ANY($2::text[])
            AND NOT EXISTS (SELECT 1 FROM ${table} d WHERE d.id::text = p.source_transaction_id::text)`, [USMCA, types]),
        why, `JE posting for a ${table} row that no longer exists (orphan)`);
    }
    return;
  }
  if (SCOPE === "zero-reset") {
    for (const t of ZERO_RESET_ROOTS) {
      if (!(await c.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [t])).rows[0]?.ok) continue;
      add(plan, t, await ids(c, `SELECT id::text AS id FROM ${t} WHERE operating_company_id = $1::uuid`, [USMCA]), why, "ROUND 326 zero-reset: every created document / transaction");
    }
    // Every dispatch table row of the company (dispatches, stops, assignments, ...).
    const dispatchTables = (await c.query<{ t: string }>(
      `SELECT c.table_schema || '.' || c.table_name AS t FROM information_schema.columns c
         JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'dispatch' AND c.column_name = 'operating_company_id'
          AND EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = c.table_schema AND k.table_name = c.table_name AND k.column_name = 'id')`
    )).rows.map((r) => r.t);
    for (const t of dispatchTables) add(plan, t, await ids(c, `SELECT id::text AS id FROM ${t} WHERE operating_company_id = $1::uuid`, [USMCA]), why, "ROUND 326 zero-reset: dispatch record");
    // ROUND 359 ADDITION 1 — collect the rows that escaped their company (no company filter can see them).
    for (const t of await companyColumnTables(c)) {
      const n = Number((await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t} WHERE operating_company_id IS NULL`)).rows[0]?.n);
      if (!n) continue;
      if (zeroResetPreserved(t) || !ZERO_RESET_DELETE_SCHEMAS.has(t.split(".")[0])) {
        if (SHARED_BY_DESIGN[t]) ESCAPED_REPORT.push(`KEPT ${t}: ${n} row(s) with no company — shared by design (${SHARED_BY_DESIGN[t]}), never deleted`);
        else ESCAPED_REPORT.push(`BLOCKER ${t}: ${n} row(s) with NO company in a PRESERVED table — never deleted; resolve before APPLY`);
        continue;
      }
      const pk = await pkOf(c, t);
      if (!pk) { ESCAPED_REPORT.push(`UNHANDLED ${t}: ${n} row(s) with no company and no single-column primary key — resolve before APPLY`); continue; }
      const got = add(plan, t, await ids(c, `SELECT ${pk}::text AS id FROM ${t} WHERE operating_company_id IS NULL`), why, ESCAPED_REASON);
      ESCAPED_REPORT.push(`ESCAPED ${t}: ${got} row(s) with NO company collected for deletion`);
    }
    return;
  }
  throw new Error("--scope=transportation21 | --scope=usmca-clean | --scope=orphan-postings | --scope=zero-reset is required");
}

async function fkGraph(c: Q): Promise<Fk[]> {
  return (await c.query<Fk>(
    `SELECT cr.relnamespace::regnamespace::text || '.' || cr.relname AS child, ca.attname AS "childCol",
            pr.relnamespace::regnamespace::text || '.' || pr.relname AS parent, pa.attname AS "parentCol",
            CASE con.confdeltype WHEN 'c' THEN 'cascade' WHEN 'n' THEN 'set null' WHEN 'd' THEN 'set default' ELSE 'no action' END AS "onDelete",
            (SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
              WHERE i.indrelid = cr.oid AND i.indisprimary AND i.indnkeyatts = 1) AS "childPk",
            array_length(con.conkey, 1) AS cols,
            NOT ca.attnotnull AS nullable,
            (SELECT a2.attname FROM pg_attribute a2 WHERE a2.attrelid = con.conrelid AND a2.attnum = con.conkey[2]) AS "childCol2",
            (SELECT a3.attname FROM pg_attribute a3 WHERE a3.attrelid = con.confrelid AND a3.attnum = con.confkey[2]) AS "parentCol2"
       FROM pg_constraint con
       JOIN pg_class cr ON cr.oid = con.conrelid
       JOIN pg_class pr ON pr.oid = con.confrelid
       JOIN pg_attribute ca ON ca.attrelid = con.conrelid AND ca.attnum = con.conkey[1]
       JOIN pg_attribute pa ON pa.attrelid = con.confrelid AND pa.attnum = con.confkey[1]
      WHERE con.contype = 'f'`
  )).rows;
}

async function pkOf(c: Q, table: string): Promise<string | null> {
  const r = await c.query<{ a: string }>(
    `SELECT a.attname AS a FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      WHERE i.indrelid = $1::regclass AND i.indisprimary AND i.indnkeyatts = 1`, [table]);
  return r.rows[0]?.a ?? null;
}

/** Collect every row hanging off the plan through foreign keys, recursively. Returns the delete order (deepest first). */
async function expand(c: Q, plan: Plan, why: Map<string, string>, report: string[]) {
  const fks = await fkGraph(c);
  const depth = new Map<string, number>([...plan.keys()].map((t) => [t, 0]));
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    for (const fk of fks) {
      const parentIds = plan.get(fk.parent);
      if (!parentIds?.size || NEVER_RECURSE.has(fk.child)) continue;
      // JE <-> JE reversal links are handled by the reversal-partner step below (both halves always go together).
      if (fk.child === "accounting.journal_entries" && fk.parent === "accounting.journal_entries") continue;
      const parentPk = await pkOf(c, fk.parent);
      if (!parentPk) continue;
      const vals = fk.parentCol === parentPk ? [...parentIds]
        : (await c.query<{ v: string }>(`SELECT ${fk.parentCol}::text AS v FROM ${fk.parent} WHERE ${parentPk}::text = ANY($1::text[]) AND ${fk.parentCol} IS NOT NULL`, [[...parentIds]])).rows.map((r) => r.v);
      if (!vals.length) continue;
      if (SCOPE === "zero-reset") {
        // A composite (operating_company_id, x) FK: the meaningful column is the second one.
        const composite = fk.cols > 1 && fk.childCol === "operating_company_id" && fk.childCol2 && fk.parentCol2;
        const childCol = composite ? fk.childCol2! : fk.childCol;
        const pcol = composite ? fk.parentCol2! : fk.parentCol;
        const zvals = pcol === parentPk ? [...parentIds]
          : (await c.query<{ v: string }>(`SELECT ${pcol}::text AS v FROM ${fk.parent} WHERE ${parentPk}::text = ANY($1::text[]) AND ${pcol} IS NOT NULL`, [[...parentIds]])).rows.map((r) => r.v);
        if (!zvals.length) continue;
        const n = Number((await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${fk.child} WHERE ${childCol}::text = ANY($1::text[])`, [zvals])).rows[0]?.n);
        if (!n) continue;
        if (RESET_TABLES.has(fk.child)) { pushReset({ table: fk.child, col: childCol, vals: zvals, kind: "bank" }); continue; }
        if (zeroResetPreserved(fk.child)) {
          if (isMasterOrPreserve(fk.child) || !fk.nullable) {
            report.push(`BLOCKER ${fk.child}.${childCol} -> ${fk.parent}: ${n} row(s) of a PRESERVED table would be touched — the zero-reset refuses (master data / preserve survive untouched)`);
          } else {
            pushReset({ table: fk.child, col: childCol, vals: zvals, kind: "unlink" });
          }
          continue;
        }
        if (!fk.childPk) { pushReset({ table: fk.child, col: childCol, vals: zvals, kind: "rows" }); continue; }
        if (composite && plan.get(fk.child)?.size) continue; // its rows arrive through the single-column FK
        const zkids = (await c.query<{ id: string }>(`SELECT ${fk.childPk}::text AS id FROM ${fk.child} WHERE ${childCol}::text = ANY($1::text[])`, [zvals])).rows.map((r) => r.id);
        if (add(plan, fk.child, zkids, why, `zero-reset: references ${fk.parent} (${childCol})`)) {
          changed = true;
          depth.set(fk.child, Math.max(depth.get(fk.child) ?? 0, (depth.get(fk.parent) ?? 0) + 1));
        }
        continue;
      }
      if (fk.cols > 1 || !fk.childPk) {
        const n = (await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${fk.child} WHERE ${fk.childCol}::text = ANY($1::text[])`, [vals])).rows[0]?.n;
        if (Number(n) > 0) report.push(`UNHANDLED ${fk.child}.${fk.childCol} -> ${fk.parent}: ${n} row(s) (no single-column primary key / multi-column FK) — resolve before APPLY`);
        continue;
      }
      if (fk.onDelete === "set null" || fk.onDelete === "set default") {
        const n = (await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${fk.child} WHERE ${fk.childCol}::text = ANY($1::text[])`, [vals])).rows[0]?.n;
        if (Number(n) > 0) report.push(`SET-NULL ${fk.child}.${fk.childCol} -> ${fk.parent}: ${n} live row(s) would be unlinked, not deleted — review`);
        continue;
      }
      const kids = (await c.query<{ id: string }>(`SELECT ${fk.childPk}::text AS id FROM ${fk.child} WHERE ${fk.childCol}::text = ANY($1::text[])`, [vals])).rows.map((r) => r.id);
      if (kids.length && !OWNED.has(fk.child) && !plan.get(fk.child)?.size) {
        report.push(`BLOCKER ${fk.child}.${fk.childCol} -> ${fk.parent}: ${kids.length} independent row(s) reference the deleted set — decide per row (${kids.slice(0, 5).join(", ")}${kids.length > 5 ? ", …" : ""})`);
        continue;
      }
      if (kids.length && !OWNED.has(fk.child)) {
        const missing = kids.filter((k) => !plan.get(fk.child)?.has(k));
        if (missing.length) report.push(`BLOCKER ${fk.child}.${fk.childCol} -> ${fk.parent}: ${missing.length} independent row(s) reference the deleted set — decide per row (${missing.slice(0, 5).join(", ")})`);
        continue;
      }
      if (add(plan, fk.child, kids, why, `references ${fk.parent} (${fk.childCol})`)) {
        changed = true;
        depth.set(fk.child, Math.max(depth.get(fk.child) ?? 0, (depth.get(fk.parent) ?? 0) + 1));
      }
    }
  }
  // JE reversal partners: an original and its reversal go together (a reversal pair is a void by another name).
  const jes = plan.get("accounting.journal_entries");
  if (jes?.size) {
    const partners = await ids(c, `SELECT x.id::text AS id FROM (SELECT reversed_by_je_id AS id FROM accounting.journal_entries WHERE id::text = ANY($1::text[]) UNION SELECT id FROM accounting.journal_entries WHERE reverses_je_id::text = ANY($1::text[])) x WHERE x.id IS NOT NULL`, [[...jes]]);
    if (add(plan, "accounting.journal_entries", partners, why, "reversal partner of a deleted JE")) return expand(c, plan, why, report);
  }
  const byDepth = [...plan.keys()].sort((a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0));
  if (SCOPE !== "zero-reset") return byDepth;
  // ROUND 326 queue item 22: delete order is TOPOLOGICAL over the FK graph — a table goes only after every table
  // referencing it (children first); a cycle falls back to the depth order for what remains.
  const inPlan = new Set(byDepth);
  const edges = fks.filter((f) => inPlan.has(f.child) && inPlan.has(f.parent) && f.child !== f.parent);
  const order: string[] = [];
  const left = new Set(byDepth);
  while (left.size) {
    const ready = byDepth.filter((t) => left.has(t) && !edges.some((e) => e.parent === t && left.has(e.child)));
    const pick = ready.length ? ready : [byDepth.find((t) => left.has(t))!];
    for (const t of pick) { order.push(t); left.delete(t); }
  }
  return order;
}

/** References with no foreign key (polymorphic text ids): document links and JE source links to a deleted record. */
async function polymorphic(c: Q, plan: Plan, why: Map<string, string>): Promise<number> {
  let n = 0;
  for (const [table, types] of Object.entries(DOC_SOURCE)) {
    const docs = [...(plan.get(table) ?? [])];
    if (!docs.length) continue;
    n += add(plan, "accounting.journal_entries", await ids(c, `SELECT DISTINCT journal_entry_uuid::text AS id FROM accounting.journal_entry_postings WHERE source_transaction_type = ANY($1::text[]) AND source_transaction_id::text = ANY($2::text[])`, [types, docs]), why, `JE posting for a deleted ${table}`);
  }
  const targets: Array<[string, string[]]> = [["load", [...(plan.get("mdata.loads") ?? [])]], ["invoice", [...(plan.get("accounting.invoices") ?? [])]]];
  for (const [kind, list] of targets) {
    if (!list.length) continue;
    n += add(plan, "accounting.transaction_source_links", await ids(c, `SELECT id::text AS id FROM accounting.transaction_source_links WHERE linked_object_type = $1 AND linked_object_id::text = ANY($2::text[])`, [kind, list]), why, `JE source link to a deleted ${kind}`);
    if ((await c.query<{ ok: boolean }>(`SELECT to_regclass('docs.file_links') IS NOT NULL AS ok`)).rows[0]?.ok) {
      n += add(plan, "docs.file_links", await ids(c, `SELECT id::text AS id FROM docs.file_links WHERE entity_type = $1 AND entity_id::text = ANY($2::text[])`, [kind, list]), why, `document link to a deleted ${kind}`);
    }
  }
  return n;
}


type R390Gate = { table: string; planned: number; gate: string; retained: number; mustVoid: number; noDeletePolicy: boolean };

/** ROUND 390 — classify every planned table's delete gate from the live catalog (never a hand-kept list). */
async function r390Gates(c: Q, order: string[], plan: Plan): Promise<R390Gate[]> {
  const fin = (await c.query<{ src: string }>(`SELECT prosrc AS src FROM pg_proc WHERE oid = to_regprocedure('accounting.refuse_financial_row_delete()')`)).rows[0]?.src ?? "";
  const arrays = [...fin.matchAll(/v_table = ANY \(ARRAY\[([\s\S]*?)\]\)/g)].map((m) => [...m[1].matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((x) => x[1]));
  // The last four arrays, in the function's own order: ARM 0 true child, detail, document (must be voided), master (sample only).
  const [trueChild, detail, documents, masters] = arrays.slice(-4).map((a) => new Set(a));
  const trig = (await c.query<{ t: string; fn: string; fin: boolean }>(
    `SELECT c.oid::regclass::text AS t, string_agg(DISTINCT p.oid::regprocedure::text, ', ') AS fn,
            bool_or(p.oid = to_regprocedure('accounting.refuse_financial_row_delete()')) AS fin
       FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_proc p ON p.oid = tg.tgfoid
      WHERE NOT tg.tgisinternal AND tg.tgenabled <> 'D' AND (tg.tgtype & 8) = 8 AND (tg.tgtype & 2) = 2 AND p.prosrc ~* 'raise\\s+exception'
      GROUP BY 1`
  )).rows;
  const trigBy = new Map(trig.map((r) => [r.t, r]));
  const rls = (await c.query<{ t: string; rls: boolean; del: boolean }>(
    `SELECT c.oid::regclass::text AS t, c.relrowsecurity AS rls,
            EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polcmd IN ('d', '*')) AS del
       FROM pg_class c WHERE c.relkind IN ('r', 'p')`
  )).rows;
  const rlsBy = new Map(rls.map((r) => [r.t, r]));
  const out: R390Gate[] = [];
  for (const t of order) {
    const idsPlanned = [...(plan.get(t) ?? [])];
    if (!idsPlanned.length) continue;
    const tr = trigBy.get(t);
    let gate = "none";
    let retained = 0;
    let mustVoid = 0;
    if (tr && !tr.fin) {
      gate = `WORM ${tr.fn} — RETAINED`;
      retained = idsPlanned.length;
    } else if (tr?.fin) {
      if (trueChild.has(t)) gate = "financial ARM 0 (child of a voided document)";
      else if (detail.has(t)) gate = "financial detail arm (owner AUTH)";
      else if (documents.has(t)) {
        gate = "financial document arm (owner AUTH, voided only)";
        const pk = await pkOf(c, t);
        const hasVoid = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_schema || '.' || table_name = $1 AND column_name = 'voided_at'`, [t])).rows.length > 0;
        if (pk && hasVoid) {
          mustVoid = Number((await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t} WHERE ${pk}::text = ANY($1::text[]) AND voided_at IS NULL`, [idsPlanned])).rows[0]?.n ?? 0);
        }
      } else if (masters.has(t)) {
        gate = "financial master arm — sample rows only: REAL rows REFUSED (needs an owner-authorized entity-purge arm)";
        const pk = await pkOf(c, t);
        if (pk) retained = Number((await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t} WHERE ${pk}::text = ANY($1::text[]) AND is_sample_data IS DISTINCT FROM true`, [idsPlanned])).rows[0]?.n ?? 0);
      } else {
        gate = "financial — NO arm admits it: REFUSED for every role";
        retained = idsPlanned.length;
      }
    }
    const r = rlsBy.get(t);
    out.push({ table: t, planned: idsPlanned.length, gate, retained, mustVoid, noDeletePolicy: Boolean(r?.rls && !r.del) });
  }
  return out;
}

async function masterCounts(c: Q): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of MASTER_TABLES) {
    if (!(await c.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [t])).rows[0]?.ok) continue;
    out[t] = Number((await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t}`)).rows[0]?.n);
  }
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
  const client = new pg.Client({ connectionString: url, statement_timeout: 120000 });
  await client.connect();
  console.log(APPLY ? `MODE: APPLY (${AUTH_ID}) — permanent delete` : "MODE: DRY RUN — read-only plan, nothing written");
  try {
    if (APPLY) await assertIsIntendedProduction(client, { label: "scripts/ops/2026-10-02-cc1-r326-complete-delete.ts" });
    await client.query(APPLY ? "BEGIN" : "BEGIN READ ONLY");
    if (APPLY) await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA]);
    const plan: Plan = new Map();
    const why = new Map<string, string>();
    const report: string[] = [];
    await roots(client, plan, why);
    let order = await expand(client, plan, why, report);
    for (let i = 0; i < 5 && (await polymorphic(client, plan, why)); i++) order = await expand(client, plan, why, report);
    const ledgerBefore = (await client.query<{ dr: string; cr: string; unb: string }>(
      `SELECT COALESCE(sum(amount_cents) FILTER (WHERE debit_or_credit::text = 'debit'), 0)::text AS dr, COALESCE(sum(amount_cents) FILTER (WHERE debit_or_credit::text = 'credit'), 0)::text AS cr,
              (SELECT count(*) FROM (SELECT journal_entry_uuid FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid GROUP BY 1
                HAVING sum(CASE WHEN debit_or_credit::text = 'debit' THEN amount_cents ELSE -amount_cents END) <> 0) u)::text AS unb
         FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`, [USMCA])).rows[0];
    const planJes = [...(plan.get("accounting.journal_entries") ?? [])];
    const removed = (await client.query<{ dr: string; cr: string }>(
      `SELECT COALESCE(sum(amount_cents) FILTER (WHERE debit_or_credit::text = 'debit'), 0)::text AS dr, COALESCE(sum(amount_cents) FILTER (WHERE debit_or_credit::text = 'credit'), 0)::text AS cr
         FROM accounting.journal_entry_postings WHERE journal_entry_uuid::text = ANY($1::text[])`, [planJes])).rows[0];
    console.log(`SCOPE ${SCOPE} — PLAN (delete order, deepest first):`);
    for (const t of order) console.log(`  ${t.padEnd(55)} ${plan.get(t)?.size ?? 0}`);
    for (const e of ESCAPED_REPORT) {
      console.log(`  ${e.startsWith("BLOCKER") || e.startsWith("UNHANDLED") ? "!" : "~"} ${e}`);
      if (e.startsWith("BLOCKER") || e.startsWith("UNHANDLED")) report.push(e);
    }
    for (const r of [...new Set(report)]) if (!ESCAPED_REPORT.includes(r)) console.log(`  ! ${r}`);
    if (R390_GATES) {
      const gates = await r390Gates(client, order, plan);
      console.log("ROUND 390 — DELETE GATES per planned table (reverse -> void -> purge; one transaction per document):");
      console.log(`  ${"table".padEnd(48)} ${"rows".padStart(6)} ${"void 1st".padStart(8)} ${"retained".padStart(8)}  rls-del  gate`);
      for (const g of gates) {
        console.log(`  ${g.table.padEnd(48)} ${String(g.planned).padStart(6)} ${String(g.mustVoid).padStart(8)} ${String(g.retained).padStart(8)}  ${g.noDeletePolicy ? "NONE   " : "ok     "}  ${g.gate}`);
      }
      const sum = (f: (g: R390Gate) => number) => gates.reduce((n, g) => n + f(g), 0);
      console.log(`ROUND 390 TOTALS: planned ${sum((g) => g.planned)} | live documents to VOID first ${sum((g) => g.mustVoid)} | RETAINED (WORM / refused) ${sum((g) => g.retained)} | tables where ih35_app has NO delete policy ${gates.filter((g) => g.noDeletePolicy).length}`);
      for (const g of gates.filter((x) => x.retained > 0)) console.log(`  RETAINED ${g.table}: ${g.retained} row(s) — ${g.gate}`);
    }
    console.log(`LEDGER (USMCA) before: DR ${ledgerBefore.dr} CR ${ledgerBefore.cr} unbalanced JEs ${ledgerBefore.unb}; removed by plan: DR ${removed.dr} CR ${removed.cr} (must be equal)`);
    if (removed.dr !== removed.cr) throw new Error("PLAN REFUSED: the JEs in scope do not net to zero — the ledger would not balance");
    if (SCOPE === "zero-reset") {
      // The preservation engine (CC-3 queue item 11, preserve.*) must have recorded its rows BEFORE anything is reset.
      const pres = (await client.query<{ t: string; n: string }>(
        `SELECT table_name AS t, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM preserve.%I', table_name), false, true, '')))[1]::text AS n
           FROM information_schema.tables WHERE table_schema = 'preserve' AND table_type = 'BASE TABLE'`
      )).rows;
      const presBlock: string[] = [];
      if (!pres.length) presBlock.push("BLOCKER preservation engine: the preserve schema does not exist — run the preservation engine first");
      for (const p of pres) if (Number(p.n) === 0) presBlock.push(`BLOCKER preservation engine has not recorded preserve.${p.t} (0 rows) — run it before the zero-reset`);
      for (const b of presBlock) { report.push(b); console.log(`  ! ${b}`); }
      for (const r of RESETS) console.log(`  ${r.kind === "bank" ? "bank line kept, unlinked" : r.kind === "unlink" ? "operational row kept, link cleared" : "child rows deleted by FK"}: ${r.table}.${r.col} — ${r.vals.length} parent id(s)`);
    }
    const effect = (await client.query<{ acct: string; bank: boolean; net: string }>(
      `SELECT a.account_number || ' ' || a.account_name AS acct,
              (a.account_type ILIKE 'bank%' OR EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r WHERE r.account_id = a.id AND r.role = 'operating_bank')) AS bank,
              sum(CASE WHEN p.debit_or_credit::text = 'debit' THEN p.amount_cents ELSE -p.amount_cents END)::text AS net
         FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE p.journal_entry_uuid::text = ANY($1::text[])
        GROUP BY 1, 2 HAVING sum(CASE WHEN p.debit_or_credit::text = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) <> 0
        ORDER BY abs(sum(CASE WHEN p.debit_or_credit::text = 'debit' THEN p.amount_cents ELSE -p.amount_cents END)) DESC`, [planJes])).rows;
    console.log("BALANCE EFFECT of the delete (net DR removed per account; every other account nets 0):");
    for (const e of effect) console.log(`  ${e.acct.padEnd(50)} ${e.net}${e.bank ? "  <- BANK" : ""}`);
    for (const e of effect.filter((x) => x.bank && !ALLOW_BANK_EFFECT)) {
      const msg = `BLOCKER bank account ${e.acct} would change by ${e.net} cents — a deletion that moves a bank balance needs ALLOW_BANK_EFFECT=1 under an AUTH that names it`;
      report.push(msg);
      console.log(`  ! ${msg}`);
    }
    if (report.some((r) => r.startsWith("UNHANDLED") || r.startsWith("BLOCKER"))) {
      if (APPLY) throw new Error("PLAN REFUSED: independent records reference the deleted set — each needs a decision before APPLY");
    }
    if (!APPLY) { await client.query("ROLLBACK"); return; }

    const ready = (await client.query<{ ok: boolean }>(`SELECT to_regclass('_system.purge_authorized_rows') IS NOT NULL AND to_regclass('audit.record_deletions') IS NOT NULL AS ok`)).rows[0]?.ok;
    if (!ready) throw new Error("migration 202615210200 is not applied — the listed-row purge arm does not exist");
    const masterBefore = SCOPE === "zero-reset" ? await masterCounts(client) : null;
    if (SCOPE === "zero-reset") {
      // HARD ASSERTION (CC-3 preservation ledger, ROUND 296 6c / 288.3 5): nothing the zero-reset deletes, unlinks or
      // resets may live in a preserved table — preserve.* (806,989 positions / 714,595 HOS), master data, identity,
      // catalogs, audit. Checked against the FINAL plan right before the first write; any hit throws and rolls back.
      const touched = [...order, ...RESETS.map((r) => r.table)];
      const hits = touched.filter((t) => t.split(".")[0] === "preserve" || isMasterOrPreserve(t));
      if (hits.length) throw new Error(`ZERO-RESET REFUSED: the plan would touch preserved table(s) ${[...new Set(hits)].join(", ")} — rolled back`);
      const presRows = Number((await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM information_schema.tables WHERE table_schema = 'preserve' AND table_type = 'BASE TABLE'`)).rows[0]?.n);
      if (!presRows) throw new Error("ZERO-RESET REFUSED: the preservation ledger (preserve.*) does not exist — run the preservation engine first");
    }
    if (SCOPE === "zero-reset") {
      // Bank lines kept, unlinked from the deleted documents, back in the categorization queue.
      for (const r of RESETS) {
        if (r.kind === "bank") {
          await client.query(
            `UPDATE ${r.table} SET ${r.col} = NULL,
                    status = CASE WHEN status = 'categorized' THEN 'pending_categorization' ELSE status END,
                    review_state = CASE WHEN review_state = 'matched' THEN 'for_review' ELSE review_state END,
                    updated_at = now()
              WHERE ${r.col}::text = ANY($1::text[]) AND operating_company_id = $2::uuid`,
            [r.vals, USMCA]
          );
        } else if (r.kind === "unlink") {
          await client.query(`UPDATE ${r.table} SET ${r.col} = NULL WHERE ${r.col}::text = ANY($1::text[])`, [r.vals]);
        } else {
          await client.query(
            `INSERT INTO audit.record_deletions (operating_company_id, deletion_route, auth_id, table_name, row_pk, reason, row_data)
             SELECT $1::uuid, 'auth_purge', $2, $3, d.${r.col}::text, $4, to_jsonb(d) FROM ${r.table} d WHERE d.${r.col}::text = ANY($5::text[])`,
            [USMCA, AUTH_ID, r.table, "ROUND 326 zero-reset (child row without a primary key)", r.vals]);
          await client.query(`DELETE FROM ${r.table} WHERE ${r.col}::text = ANY($1::text[])`, [r.vals]);
        }
      }
      // Every bank line of the company goes back to the queue: most matched_* pointers carry no FK, so the graph
      // cannot see them — clear them all (the documents they pointed at are being deleted) and un-categorize.
      const matchedCols = (await client.query<{ c: string }>(
        `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'banking' AND table_name = 'bank_transactions' AND column_name LIKE 'matched\\_%\\_id'`
      )).rows.map((r) => r.c);
      if (matchedCols.length) {
        // ROUND 363-CC3-B / ROUND 366.1(b) — the bank line is preserved and every match it carried is recorded as
        // released ('purge_reset') BEFORE the pointers clear, while the documents still exist; the deferred refusal
        // trg_send_back_keeps_the_match (migration 202615330930) rejects the COMMIT otherwise.
        await client.query(
          `SELECT banking.release_bank_line_matches(id, 'purge_reset', $2, NULL)
             FROM banking.bank_transactions
            WHERE operating_company_id = $1::uuid AND (${matchedCols.map((c) => `${c} IS NOT NULL`).join(" OR ")})`,
          [USMCA, `ROUND 326 zero-reset ${AUTH_ID}`]
        );
        await client.query(
          `UPDATE banking.bank_transactions
              SET ${matchedCols.map((c) => `${c} = NULL`).join(", ")},
                  status = CASE WHEN status = 'categorized' THEN 'pending_categorization' ELSE status END,
                  review_state = CASE WHEN review_state IN ('matched', 'categorized') THEN 'for_review' ELSE review_state END,
                  updated_at = now()
            WHERE operating_company_id = $1::uuid AND (${matchedCols.map((c) => `${c} IS NOT NULL`).join(" OR ")} OR status = 'categorized')`,
          [USMCA]
        );
      }
    }
    await client.query(`SELECT set_config('app.purge_auth_id', $1, true)`, [AUTH_ID]);
    for (const t of order) {
      const pk = await pkOf(client, t);
      const rows = [...(plan.get(t) ?? [])];
      if (!pk || !rows.length) continue;
      if (WORM.has(t)) {
        await client.query(`INSERT INTO _system.purge_authorized_rows (auth_id, table_name, row_pk, reason) SELECT $1, $2, x, $3 FROM unnest($4::text[]) x ON CONFLICT DO NOTHING`, [AUTH_ID, t, `ROUND 326 ${SCOPE}`, rows]);
      }
      await client.query(
        `INSERT INTO audit.record_deletions (operating_company_id, deletion_route, auth_id, table_name, row_pk, reason, row_data)
         SELECT $1::uuid, 'auth_purge', $2, $3, d.${pk}::text, $4, to_jsonb(d) FROM ${t} d WHERE d.${pk}::text = ANY($5::text[])`,
        [USMCA, AUTH_ID, t, `ROUND 326 ${SCOPE}`, rows]);
    }
    const counts: Record<string, number> = {};
    for (const t of order) {
      const pk = await pkOf(client, t);
      const rows = [...(plan.get(t) ?? [])];
      if (!pk || !rows.length) continue;
      if (SCOPE === "zero-reset" && (t.split(".")[0] === "preserve" || isMasterOrPreserve(t))) throw new Error(`ZERO-RESET REFUSED: DELETE on preserved table ${t} — rolled back`);
      const r = await client.query(`DELETE FROM ${t} WHERE ${pk}::text = ANY($1::text[])`, [rows]);
      counts[t] = r.rowCount ?? 0;
    }
    const after = (await client.query<{ dr: string; cr: string; unb: string }>(
      `SELECT COALESCE(sum(amount_cents) FILTER (WHERE debit_or_credit::text = 'debit'), 0)::text AS dr, COALESCE(sum(amount_cents) FILTER (WHERE debit_or_credit::text = 'credit'), 0)::text AS cr,
              (SELECT count(*) FROM (SELECT journal_entry_uuid FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid GROUP BY 1
                HAVING sum(CASE WHEN debit_or_credit::text = 'debit' THEN amount_cents ELSE -amount_cents END) <> 0) u)::text AS unb
         FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`, [USMCA])).rows[0];
    if (after.dr !== after.cr || Number(after.unb) !== 0) throw new Error(`LEDGER CHECK FAILED after delete: DR ${after.dr} CR ${after.cr} unbalanced ${after.unb} — rolled back`);
    if (SCOPE === "zero-reset") {
      // PROOF, same transaction: GL to zero, every deleted table to zero for the company, master data unchanged.
      const gl = Number((await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`, [USMCA])).rows[0]?.n);
      if (gl !== 0) throw new Error(`ZERO-RESET PROOF FAILED: ${gl} GL posting(s) remain — rolled back`);
      for (const t of new Set([...order, ...ZERO_RESET_ROOTS])) {
        const hasCo = (await client.query<{ ok: boolean }>(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema || '.' || table_name = $1 AND column_name = 'operating_company_id') AS ok`, [t])).rows[0]?.ok;
        if (!hasCo) continue;
        const left = Number((await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t} WHERE operating_company_id = $1::uuid`, [USMCA])).rows[0]?.n);
        if (left !== 0) throw new Error(`ZERO-RESET PROOF FAILED: ${t} still has ${left} row(s) — rolled back`);
      }
      // ROUND 359 ADDITION 2 — PROOF that no row escaped its company: every delete-schema table with the column has zero
      // company-less rows left (a company-filtered count cannot see them).
      for (const t of await companyColumnTables(client)) {
        if (zeroResetPreserved(t) || !ZERO_RESET_DELETE_SCHEMAS.has(t.split(".")[0])) continue;
        const escaped = Number((await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t} WHERE operating_company_id IS NULL`)).rows[0]?.n);
        if (escaped !== 0) throw new Error(`ROWS ESCAPED THEIR COMPANY: ${t} has ${escaped} row(s) with operating_company_id IS NULL — rolled back`);
      }
      const masterAfter = await masterCounts(client);
      for (const [t, n] of Object.entries(masterBefore ?? {})) {
        if (masterAfter[t] !== n) throw new Error(`ZERO-RESET PROOF FAILED: master table ${t} changed ${n} -> ${masterAfter[t]} — rolled back`);
      }
      console.log("ZERO-RESET PROOF: GL postings 0; every deleted table 0 for the company AND 0 with no company; master data unchanged:", JSON.stringify(masterAfter));
    }
    await client.query(`SELECT audit.append_event('owner_purge', 'warning', $1::jsonb, NULL, $2)`, [JSON.stringify({ scope: SCOPE, auth_id: AUTH_ID, counts, ledger_after: after }), `OWNER-PURGE-${AUTH_ID}`]).catch(() => undefined);
    await client.query("COMMIT");
    console.log("DELETED:", JSON.stringify(counts));
    console.log(`LEDGER (USMCA) after: DR ${after.dr} CR ${after.cr} unbalanced JEs ${after.unb}`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(String((e as Error).message ?? e)); process.exit(1); });
