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

type Q = { query: <T = Record<string, unknown>>(sql: string, v?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };
type Plan = Map<string, Set<string>>; // table -> primary-key values
type Fk = { child: string; childCol: string; parent: string; parentCol: string; onDelete: string; childPk: string | null; cols: number };

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
  throw new Error("--scope=transportation21 | --scope=usmca-clean | --scope=orphan-postings is required");
}

async function fkGraph(c: Q): Promise<Fk[]> {
  return (await c.query<Fk>(
    `SELECT cr.relnamespace::regnamespace::text || '.' || cr.relname AS child, ca.attname AS "childCol",
            pr.relnamespace::regnamespace::text || '.' || pr.relname AS parent, pa.attname AS "parentCol",
            CASE con.confdeltype WHEN 'c' THEN 'cascade' WHEN 'n' THEN 'set null' WHEN 'd' THEN 'set default' ELSE 'no action' END AS "onDelete",
            (SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
              WHERE i.indrelid = cr.oid AND i.indisprimary AND i.indnkeyatts = 1) AS "childPk",
            array_length(con.conkey, 1) AS cols
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
  return [...plan.keys()].sort((a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0));
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
    for (const r of report) console.log(`  ! ${r}`);
    console.log(`LEDGER (USMCA) before: DR ${ledgerBefore.dr} CR ${ledgerBefore.cr} unbalanced JEs ${ledgerBefore.unb}; removed by plan: DR ${removed.dr} CR ${removed.cr} (must be equal)`);
    if (removed.dr !== removed.cr) throw new Error("PLAN REFUSED: the JEs in scope do not net to zero — the ledger would not balance");
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
      const r = await client.query(`DELETE FROM ${t} WHERE ${pk}::text = ANY($1::text[])`, [rows]);
      counts[t] = r.rowCount ?? 0;
    }
    const after = (await client.query<{ dr: string; cr: string; unb: string }>(
      `SELECT COALESCE(sum(amount_cents) FILTER (WHERE debit_or_credit::text = 'debit'), 0)::text AS dr, COALESCE(sum(amount_cents) FILTER (WHERE debit_or_credit::text = 'credit'), 0)::text AS cr,
              (SELECT count(*) FROM (SELECT journal_entry_uuid FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid GROUP BY 1
                HAVING sum(CASE WHEN debit_or_credit::text = 'debit' THEN amount_cents ELSE -amount_cents END) <> 0) u)::text AS unb
         FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`, [USMCA])).rows[0];
    if (after.dr !== after.cr || Number(after.unb) !== 0) throw new Error(`LEDGER CHECK FAILED after delete: DR ${after.dr} CR ${after.cr} unbalanced ${after.unb} — rolled back`);
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
