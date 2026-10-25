/**
 * LEAD 443.358 — PERMANENTLY DELETE every test / sample / demo record in the app (USMCA + global catalogs + test units).
 *
 * OWNER (10-25-2026 2:12 PM CT, verbatim): "remove from maintenance and from the entire app all test and sample and demo
 * data, trucks, anything. completely deleted, no history nothing, i want them permanently deleted now."
 * OWNER (10-25 ~2:00 PM): authorization is not needed when his instructions are followed; the Lead guarantees compliance.
 *
 * WHAT IS A TARGET (strict, measured 10-25 on prod):
 *   - is_sample_data = true (mdata.units, mdata.equipment, mdata.drivers), or
 *   - a coder-test marker in the row's own name/label/code columns (TEST / SAMPLE / DEMO / SMOKE / DUMMY / CODEX / DEVIN /
 *     CASCADE / CC2-CC3 test / TESTMTD* / VOID-AT-LAUNCH / KEEP UNTIL LAUNCH / ZZ-SAMPLE / USMCA_GATEB_SAMPLE / P44-P47 smoke /
 *     CA-nn test), and NOT a real business word that merely contains "test" (drug / alcohol / pre-employment / road test,
 *     antidoping, latest, contest, attest, protest).
 *   - Company-scoped tables: USMCA rows only. TRANSPORTATION / TRUCKING rows are never selected. Global tables (units,
 *     equipment, a few catalogs): only marker-named / is_sample_data rows. NEVER: accounting.qbo_* / mdata.qbo_* (QBO mirror),
 *     identity.users (a shared actor hub — created_by on real rows), mdata.customers "Tio Perfumes" (code TEST-TIO; the
 *     owner's own company — owner decides).
 *
 * HOW: one row at a time inside a SAVEPOINT through accounting._purge_rows_cascade (FK-discovered children, hubs detached)
 * with the row listed in _system.purge_authorized_rows. A row is KEPT (rolled back, reported) when its cascade:
 *   - changes the books (any company): journal entries, postings (count + sum), bank lines, invoices, bills, payments,
 *     bill payments, expenses, settlements, settlement lines, driver bills, fuel transactions, loads, work orders; or
 *   - deletes any child row that is not itself test-marked in an operational/money schema (a real record hanging off it); or
 *   - errors (a WORM / append-only child the purge machinery refuses).
 * Before/after of the whole run: GL trial balance per account (USMCA), A/R 1100, A/P 2000, bank line count — must be equal
 * to the cent or the whole run rolls back.
 *
 * KNOWN LIMIT (owner "no history"): audit.record_deletions is WORM (trg_worm_refuse_delete). The purge machinery writes one
 * deletion-log row per deleted record and that log cannot be removed by any route. Reported, not worked around.
 *
 * Default = DRY RUN (everything executes, then ROLLBACK). --apply + OWNER_AUTH_ID=AUTH-469 commits.
 */
import pg from "pg";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const COMMIT = process.argv.includes("--apply");
const AUTH = COMMIT ? (process.env.OWNER_AUTH_ID ?? "") : "AUTH-469";
const REASON = "443.358: coder test/sample/demo record — owner 10-25 2:12 PM 'remove … all test and sample and demo data … permanently deleted now'";
if (COMMIT && !/^AUTH-[0-9]+$/.test(AUTH)) throw new Error("--apply requires OWNER_AUTH_ID=AUTH-NNN");
if (COMMIT) {
  const { execFileSync } = await import("node:child_process");
  const nodePath = await import("node:path");
  const ROOT = nodePath.resolve(nodePath.dirname(new URL(import.meta.url).pathname), "../..");
  try { execFileSync("node", [nodePath.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH], { stdio: "inherit" }); } catch { process.exit(1); }
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

// Test markers (lower-cased text). Word-bounded so "latest", "contest", "attest", "protest" never match.
export const TEST_RE =
  "(^|[^a-z])(test|tests|sample|demo|smoke|dummy|codex|devin|cascade|fixture|lorem)([^a-z]|$)" +
  "|cc[0-9]+[ _-]?(test|verify|diagnostic|live)|cc[0-9]test|testmtd|void-at-launch|keep until launch|zz-sample" +
  "|usmca_gateb_sample|(^|[^a-z])p[0-9]+[ _-]smoke|(^|[^a-z])ca[0-9]+ test|test[_-]m3|test-cc3|test_cc3|test-tio|-test-|_test_";
// Real business words that contain a marker.
export const REAL_RE = "drug test|alcohol test|drug or alcohol|pre-employment test|road test|road_test|antidoping|anti-doping|failed_drug_test|failed drug";

// [schema.table, text columns to test]. Order: leaf/operational records first, then hubs, then catalogs (a catalog row
// referenced by a kept real record is kept by the books/child check).
export const TARGETS: Array<[string, string[]]> = [
  ["safety.fmcsa_events", ["title"]],
  ["safety.safety_events", ["title", "description"]],
  ["safety.incidents", ["description", "claim_reason_code"]],
  ["safety.complaints", ["complainant_name"]],
  ["safety.dot_inspections", ["inspector_name"]],
  ["safety.roadside_inspections", ["report_number"]],
  ["safety.accidents", ["police_report_number"]],
  ["safety.citations", ["citation_number"]],
  ["safety.violations", ["violation_code", "description"]],
  ["safety.training_records", ["training_name"]],
  ["safety.compliance_reminders", ["item_name"]],
  ["safety.da_program_enrollments", ["consortium_name"]],
  ["safety.driver_w8ben", ["full_legal_name", "certification_name"]],
  ["safety.dvir_defects", ["major_defect_code"]],
  ["safety.dvir_defect_severity_tags", ["major_defect_code"]],
  ["safety.event_documents", ["file_name"]],
  ["safety.permits", ["holder_name"]],
  ["legal.signatures", ["signed_by_name"]],
  ["legal.contract_instances", ["signer_name"]],
  ["maintenance.inspections", ["inspector_name"]],
  ["maintenance.parts_warranty", ["part_description"]],
  ["maintenance.tire_events", ["from_position_code", "to_position_code"]],
  ["maintenance.tire_records", ["position_code"]],
  ["maintenance.tire_brands", ["name"]],
  ["compliance.form_425c_reports", ["case_number"]],
  ["geo.geofences", ["label"]],
  ["identity.driver_applicants", ["first_name", "cdl_number"]],
  ["docs.files", ["original_filename", "description"]],
  ["mdata.vendor_payment_methods", ["bank_name"]],
  ["mdata.driver_teams", ["team_name"]],
  ["mdata.maintenance_parts", ["part_name"]],
  ["mdata.maintenance_services", ["service_name", "service_code"]],
  ["mdata.locations", ["location_name"]],
  ["mdata.vendors", ["vendor_name"]],
  ["mdata.drivers", ["first_name", "last_name"]],
  ["mdata.assets", ["unit_code"]],
  ["mdata.equipment", ["equipment_number"]],
  ["mdata.units", ["unit_number", "make", "model"]],
  ["accounting.ps_item", ["name"]],
  ["accounting.ps_category", ["name"]],
  ["accounting.coa_account", ["name", "number"]],
  ["accounting.sales_tax_agencies", ["name"]],
  ["accounting.customer_classifications", ["tag_label"]],
  ["accounting.vendor_classifications", ["tag_label"]],
  ["catalogs.items", ["item_name", "description"]],
  ["catalogs.accounts", ["account_name", "account_number"]],
  ["catalogs.classes", ["class_name"]],
  ["catalogs.accident_types", ["code", "display_name"]],
  ["catalogs.additional_charges", ["code", "display_name"]],
  ["catalogs.air_bag_catalog", ["code", "display_name"]],
  ["catalogs.asset_locations", ["code", "name"]],
  ["catalogs.battery_catalog", ["display_name"]],
  ["catalogs.cargo_claim_reasons", ["reason_code", "display_name"]],
  ["catalogs.cash_advance_types", ["code", "display_name"]],
  ["catalogs.complaint_types", ["type_code", "type_name"]],
  ["catalogs.customer_quality_event_reasons", ["code", "label"]],
  ["catalogs.customer_types", ["code", "display_name"]],
  ["catalogs.def_stations", ["code", "display_name"]],
  ["catalogs.detail_types", ["name"]],
  ["catalogs.detention_reasons", ["code", "display_name"]],
  ["catalogs.dispatch_flag_colors", ["flag_code", "display_name"]],
  ["catalogs.dispatcher_error_reasons", ["code", "label"]],
  ["catalogs.dot_violation_types", ["violation_code", "display_name"]],
  ["catalogs.driver_load_statuses", ["name"]],
  ["catalogs.driver_pay_types", ["code", "display_name"]],
  ["catalogs.driver_termination_reasons", ["code", "label"]],
  ["catalogs.equipment_types", ["code", "name", "description"]],
  ["catalogs.escrow_types", ["code", "display_name"]],
  ["catalogs.expensive_states", ["description"]],
  ["catalogs.form_425c_company_profiles", ["case_number"]],
  ["catalogs.fuel_card_types", ["code", "display_name"]],
  ["catalogs.fuel_dispatch_routes", ["display_name"]],
  ["catalogs.fuel_station_brands", ["display_name"]],
  ["catalogs.internal_fine_reasons", ["reason_code", "reason_name"]],
  ["catalogs.journal_entry_types", ["code", "display_name"]],
  ["catalogs.leave_types", ["code", "display_name"]],
  ["catalogs.load_cancellation_reasons", ["reason_code", "display_name"]],
  ["catalogs.load_trailer_equipment", ["code", "display_name"]],
  ["catalogs.load_types", ["code", "display_name"]],
  ["catalogs.lumper_providers", ["code", "display_name"]],
  ["catalogs.maintenance_failure_codes", ["code", "display_name"]],
  ["catalogs.maintenance_priority_levels", ["code", "display_name"]],
  ["catalogs.maintenance_service_tasks", ["code", "display_name"]],
  ["catalogs.maintenance_shop_locations", ["code", "display_name"]],
  ["catalogs.mx_customs_brokers", ["code", "display_name"]],
  ["catalogs.pay_rate_templates", ["code", "display_name"]],
  ["catalogs.payment_methods", ["code", "display_name"]],
  ["catalogs.payment_terms", ["terms_name"]],
  ["catalogs.pickup_time_types", ["code", "display_name"]],
  ["catalogs.repair_locations", ["code", "display_name"]],
  ["catalogs.tax_codes", ["code", "display_name"]],
  ["catalogs.toll_providers", ["display_name"]],
  ["catalogs.tractor_statuses", ["name"]],
  ["catalogs.trailer_types", ["code", "name"]],
  ["catalogs.unit_ownership_types", ["name"]],
  ["catalogs.vendor_types", ["code", "display_name", "vendor_type_name"]],
  ["catalogs.void_cancel_reasons", ["reason_code", "reason_label"]],
  ["catalogs.work_order_statuses", ["code", "display_name"]],
  ["catalogs.workplace_incident_types", ["code", "display_name"]],
  ["compliance.required_document_types", ["code", "label"]],
];
// Owner decides (not purged): the owner's own company as a customer.
const NEVER_IDS = new Set(["3e066edd-22ad-4014-9871-a93cf099c382"]);
// Operational/money schemas whose non-test children make a target a REAL record.
const REAL_CHILD_SCHEMAS = "^(mdata|dispatch|maintenance|fuel|safety|legal|insurance|accounting|banking|driver_finance|compliance|factoring|settlement|payroll|telematics)\\.";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = async (s: string, v?: unknown[]) => (await c.query(s, v)).rows;

const books = async () => (await q(
  `SELECT
     (SELECT count(*) FROM accounting.journal_entries)::text je,
     (SELECT count(*)||':'||coalesce(sum(amount_cents),0) FROM accounting.journal_entry_postings) postings,
     (SELECT count(*) FROM banking.bank_transactions) bank_lines,
     (SELECT count(*) FROM accounting.invoices) invoices,
     (SELECT count(*) FROM accounting.bills) bills,
     (SELECT count(*) FROM accounting.bill_payments) bill_payments,
     (SELECT count(*) FROM accounting.expenses) expenses,
     (SELECT count(*) FROM driver_finance.driver_settlements) settlements,
     (SELECT count(*) FROM driver_finance.settlement_lines) settlement_lines,
     (SELECT count(*) FROM driver_finance.driver_bills) driver_bills,
     (SELECT count(*) FROM fuel.fuel_transactions) fuel_txns,
     (SELECT count(*) FROM mdata.loads) loads,
     (SELECT count(*) FROM maintenance.work_orders) work_orders`))[0];
const ledger = async () => (await q(
  `SELECT a.account_number, sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END)::text bal
     FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id
    WHERE p.operating_company_id = $1::uuid GROUP BY 1 ORDER BY 1`, [CO]));

const out: Record<string, unknown> = { mode: COMMIT ? `COMMIT ${AUTH}` : "DRY RUN (purge executed, then ROLLBACK)" };
const deleted: Record<string, number> = {};
const deletedSamples: Record<string, string[]> = {};
const kept: Array<{ table: string; id: string; label: string; why: string }> = [];
try {
  await c.query("BEGIN");
  await c.query("SET LOCAL statement_timeout = '600s'");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await c.query("SELECT set_config('app.operating_company_id',$1,true)", [CO]);
  await c.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER_USER_ID]);
  await c.query("SELECT set_config('app.purge_auth_id',$1,true)", [AUTH]);
  await c.query("CREATE TEMP TABLE _seen_del (id uuid PRIMARY KEY) ON COMMIT DROP");
  await c.query("INSERT INTO _seen_del SELECT id FROM audit.record_deletions WHERE auth_id = $1", [AUTH]);

  const tb0 = await ledger();
  const b0 = await books();
  const ar0 = tb0.find((r) => r.account_number === "1100")?.bal ?? "0";
  const ap0 = tb0.find((r) => r.account_number === "2000")?.bal ?? "0";

  for (const [qual, cols] of TARGETS) {
    const [sch, tbl] = qual.split(".");
    const meta = await q(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [sch, tbl]);
    const has = (n: string) => meta.some((m) => m.column_name === n);
    if (!meta.find((m) => m.column_name === "id" && m.data_type === "uuid")) { kept.push({ table: qual, id: "-", label: "", why: "no uuid id column — purge route cannot address it" }); continue; }
    const usable = cols.filter(has);
    const text = usable.length ? `lower(concat_ws(' ', ${usable.map((x) => `x.${x}::text`).join(", ")}))` : "''";
    const conds = [`(${text} ~ $1 AND ${text} !~ $2)`];
    if (has("is_sample_data")) conds.push("x.is_sample_data IS TRUE");
    const scope = has("operating_company_id") ? "AND x.operating_company_id = $3::uuid" : "";
    const rows = await q(
      `SELECT x.id::text id, left(${text}, 70) label FROM ${sch}.${tbl} x WHERE (${conds.join(" OR ")}) ${scope}`,
      scope ? [TEST_RE, REAL_RE, CO] : [TEST_RE, REAL_RE]);
    for (const r of rows) {
      if (NEVER_IDS.has(r.id)) { kept.push({ table: qual, id: r.id, label: r.label, why: "owner decides (Tio Perfumes customer)" }); continue; }
      const still = (await q(`SELECT 1 FROM ${sch}.${tbl} WHERE id = $1::uuid`, [r.id])).length;
      if (!still) continue; // already removed as a child of an earlier target
      await c.query("SAVEPOINT one");
      try {
        await c.query(`INSERT INTO _system.purge_authorized_rows (auth_id, table_name, row_pk, reason) VALUES ($1,$2,$3,$4)
                       ON CONFLICT (auth_id, table_name, row_pk) DO NOTHING`, [AUTH, qual, r.id, REASON]);
        const n = Number((await q(`SELECT accounting._purge_rows_cascade($1,$2,ARRAY[$3::uuid],$4::uuid,$5,$6::uuid,$7) n`,
          [sch, tbl, r.id, CO, AUTH, OWNER_USER_ID, REASON]))[0].n);
        const b1 = await books();
        if (JSON.stringify(b1) !== JSON.stringify(b0)) throw new Error(`books moved: ${JSON.stringify(b1)}`);
        const realKids = await q(
          `SELECT d.table_name, left(d.row_data::text, 80) t FROM audit.record_deletions d
            WHERE d.auth_id = $1 AND NOT EXISTS (SELECT 1 FROM _seen_del s WHERE s.id = d.id)
              AND d.table_name <> $2 AND d.table_name ~ $3 AND lower(d.row_data::text) !~ $4 LIMIT 3`,
          [AUTH, qual, REAL_CHILD_SCHEMAS, TEST_RE]);
        if (realKids.length) throw new Error(`would delete real child rows: ${realKids.map((k) => k.table_name).join(", ")}`);
        await c.query("INSERT INTO _seen_del SELECT id FROM audit.record_deletions WHERE auth_id = $1 ON CONFLICT DO NOTHING", [AUTH]);
        await c.query("RELEASE SAVEPOINT one");
        deleted[qual] = (deleted[qual] ?? 0) + 1;
        (deletedSamples[qual] ??= []).length < 4 && deletedSamples[qual].push(r.label);
        out[`children_${qual}`] = Number(out[`children_${qual}`] ?? 0) + (n - 1);
      } catch (e) {
        await c.query("ROLLBACK TO SAVEPOINT one");
        kept.push({ table: qual, id: r.id, label: r.label, why: (e as Error).message.slice(0, 160) });
      }
    }
  }

  const tb1 = await ledger();
  const b1 = await books();
  const ar1 = tb1.find((r) => r.account_number === "1100")?.bal ?? "0";
  const ap1 = tb1.find((r) => r.account_number === "2000")?.bal ?? "0";
  out.books_before = b0; out.books_after = b1;
  out.ar_1100 = { before: ar0, after: ar1 }; out.ap_2000 = { before: ap0, after: ap1 };
  out.trial_balance_accounts = { before: tb0.length, after: tb1.length, identical: JSON.stringify(tb0) === JSON.stringify(tb1) };
  if (JSON.stringify(b0) !== JSON.stringify(b1) || JSON.stringify(tb0) !== JSON.stringify(tb1)) throw new Error("BOOKS / TRIAL BALANCE CHANGED — refusing");
  out.deleted_targets_by_table = deleted;
  out.deleted_target_total = Object.values(deleted).reduce((a, b) => a + b, 0);
  out.deleted_samples = deletedSamples;
  out.deletion_log_rows = Number((await q(`SELECT count(*) n FROM audit.record_deletions WHERE auth_id = $1`, [AUTH]))[0].n);
  out.kept_needs_owner = kept;
  await c.query(COMMIT ? "COMMIT" : "ROLLBACK");
  out.status = COMMIT ? "COMMITTED" : "DRY_RUN_ROLLED_BACK";
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  out.status = "ROLLED_BACK"; out.error = (e as Error).message;
  console.log(JSON.stringify(out, null, 2)); await c.end(); process.exit(1);
}
console.log(JSON.stringify(out, null, 2));
await c.end();
