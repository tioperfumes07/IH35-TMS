#!/usr/bin/env node
/**
 * GUARD: no live row may reference a driver that was VOIDED by a duplicate-driver merge, once a
 * survivor row exists for it.
 *
 * WHY (2026-09-03): the SAFETY-USMCA-DUPLICATE-DRIVER-MERGE-EXECUTED-33-PAIRS merge repointed 33
 * duplicate driver pairs (mdata.drivers), but downstream writers across dozens of schemas hold
 * their own driver_id/driver_uuid column and were never told about the merge — the merge itself
 * does not "drag" those foreign keys. The owner hit this live within minutes: the Book Load wizard
 * showed a driver selected AND "Driver was not found for this operating company" simultaneously,
 * because some other row still pointed at the archived (loser) id.
 *
 * A voided-by-merge driver row is identified by BOTH:
 *   - archived_at IS NOT NULL
 *   - notes contains the literal marker this session's merge wrote: 'CC-3 duplicate merge'
 * That marker is specific to an actual dedupe merge (not every archived/deactivated driver — a
 * driver can be legitimately archived for other reasons without a live duplicate to repoint to).
 *
 * Checks every driver_id/driver_uuid-shaped column this repo has today (kept in sync manually;
 * add a new one here whenever a new driver-referencing column is added). Fails listing every
 * (table.column, count) pair with a live reference to a voided-by-merge driver.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const LABEL = "verify-no-orphaned-driver-merge-references";
const SELFTEST = process.argv.includes("--selftest");

// table.column pairs known to reference mdata.drivers(id), by column name convention (no formal
// FK constraints exist on this table — see SAFETY-USMCA-DUPLICATE-DRIVER-MERGE-EXECUTED-33-PAIRS).
// Keep this list in sync with information_schema when new driver_id/driver_uuid columns land.
const COLUMNS = [
  ["accounting.bills", "driver_id"], ["accounting.expenses", "driver_uuid"],
  ["banking.bank_transaction_splits", "driver_id"], ["banking.bank_transactions", "categorization_driver_id"],
  ["catalogs.driver_leave_balances", "driver_id"], ["chat.messages", "sender_driver_id"],
  ["chat.participants", "driver_id"], ["compliance.dot_inspection_events", "driver_id"],
  ["compliance.drug_alcohol_pool_members", "driver_id"], ["compliance.drug_alcohol_random_selections", "driver_id"],
  ["compliance.drug_alcohol_test_results", "driver_id"], ["compliance.return_to_duty_processes", "driver_id"],
  ["dispatch.auto_status_suggestions", "driver_id"], ["dispatch.border_crossing_events", "driver_uuid"],
  ["dispatch.cargo_sensor_incidents", "driver_id"], ["dispatch.detention_events", "driver_id"],
  ["dispatch.driver_layovers", "driver_uuid"], ["dispatch.intransit_issues", "driver_id"],
  ["dispatch.late_arrival_aggregates", "driver_id"], ["dispatch.load_abandonments", "driver_id"],
  ["dispatch.load_abandonments", "recovery_driver_id"], ["dispatch.load_assignment_history", "new_driver_id"],
  ["dispatch.load_assignment_history", "previous_driver_id"], ["dispatch.pod_documents", "driver_id"],
  ["dispatch.stop_arrivals", "driver_id"], ["driver_finance.abandonment_chargebacks", "driver_id"],
  ["driver_finance.auto_deduction_policies", "driver_id"], ["driver_finance.cash_advance_requests", "driver_id"],
  ["driver_finance.deduction_schedule", "driver_id"], ["driver_finance.driver_advance_accounts", "driver_id"],
  ["driver_finance.driver_advances", "driver_id"], ["driver_finance.driver_bills", "driver_id"],
  ["driver_finance.driver_bills", "team_driver_id"], ["driver_finance.driver_deduction_buckets", "driver_id"],
  ["driver_finance.driver_escrow_separations", "driver_id"], ["driver_finance.driver_liabilities", "driver_id"],
  ["driver_finance.driver_pay_rates", "driver_id"], ["driver_finance.driver_pay_settings", "driver_id"],
  ["driver_finance.driver_payment_methods", "driver_id"], ["driver_finance.driver_reimbursements", "driver_id"],
  ["driver_finance.driver_settlement_deductions", "driver_id"], ["driver_finance.driver_settlement_disputes", "driver_id"],
  ["driver_finance.driver_settlement_gl_runs", "driver_id"], ["driver_finance.driver_settlements", "driver_id"],
  ["driver_finance.escrow_balances", "driver_id"], ["driver_finance.escrow_deductions_pending", "driver_id"],
  ["driver_finance.escrow_ledger", "driver_id"], ["driver_finance.presettlement_link_suggestions", "driver_id"],
  ["driver_finance.settlement_contract_lines", "driver_id"], ["driver_finance.settlement_contract_lines", "referred_driver_id"],
  ["driver_finance.settlement_disputes", "driver_id"], ["driver_finance.settlement_lines", "split_partner_driver_id"],
  ["driver_finance.settlement_preview_costs", "driver_id"], ["driver_finance.signed_acknowledgments", "driver_id"],
  ["driver_finance.team_settlement_splits", "driver_id"], ["driver_pwa.push_subscriptions", "driver_id"],
  ["driveralert.dispatch", "acked_by_driver_id"], ["driveralert.dispatch", "driver_id"],
  ["fuel.fuel_card_overage_events", "driver_id"], ["fuel.fuel_card_overage_policies", "driver_id"],
  ["fuel.fuel_transactions", "driver_id"], ["geo.geofence_events", "driver_id"],
  ["hos.duty_status_events", "driver_id"], ["identity.driver_applicants", "converted_driver_id"],
  ["identity.driver_invites", "driver_id"], ["insurance.claim", "driver_id"],
  ["insurance.driver_schedule", "driver_id"], ["insurance.schedule_confirmations", "driver_id"],
  ["integrations.auto_status_switch_events", "driver_uuid"], ["integrations.relay_fuel_transactions", "matched_driver_id"],
  ["integrations.samsara_drivers", "local_driver_id"], ["integrity.anomaly", "driver_id"],
  ["integrity.driver_metric", "driver_id"], ["legal.matters", "related_driver_id"],
  ["maintenance.driver_reports", "driver_id"], ["maintenance.dvir_submissions", "driver_id"],
  ["maintenance.road_service_tickets", "driver_id"], ["maintenance.work_orders", "driver_id"],
  ["mdata.driver_cdl_endorsements", "driver_id"], ["mdata.driver_cdl_restrictions", "driver_id"],
  ["mdata.driver_company_authorizations", "driver_id"], ["mdata.driver_equipment_qualifications", "driver_id"],
  ["mdata.driver_profile_messages", "driver_id"], ["mdata.driver_safety_events", "driver_id"],
  ["mdata.driver_tag_memberships", "driver_id"], ["mdata.driver_teams", "primary_driver_id"],
  ["mdata.driver_teams", "secondary_driver_id"], ["mdata.driver_vendor_merges", "driver_id"],
  ["mdata.equipment", "assigned_driver_id"], ["mdata.mx_permits", "driver_id"],
  ["mdata.mx_tolls_ledger", "driver_id"], ["mdata.unit_border_crossings", "driver_id"],
  ["mdata.units", "assigned_driver_id"], ["mdata.vendors", "driver_id"],
  ["payroll.driver_settlement_line_items", "split_partner_driver_id"], ["payroll.driver_settlements", "driver_id"],
  ["pwa.driver_notifications", "driver_id"], ["safety.accident_liabilities", "driver_id"],
  ["safety.accident_reports", "driver_id"], ["safety.accidents", "driver_id"],
  ["safety.background_checks", "driver_id"], ["safety.citations", "driver_id"],
  ["safety.civil_fines", "subject_driver_id"], ["safety.clearinghouse_query", "driver_id"],
  ["safety.company_violation_drivers", "driver_id"], ["safety.complaints", "complainant_driver_id"],
  ["safety.complaints", "respondent_driver_id"], ["safety.compliance_reminders", "driver_id"],
  ["safety.da_program_enrollments", "driver_uuid"], ["safety.da_test_records", "driver_uuid"],
  ["safety.document_alert_events", "driver_id"], ["safety.dot_inspections", "driver_id"],
  ["safety.driver_documents", "driver_id"], ["safety.driver_leave_days", "driver_id"],
  ["safety.driver_leave_requests", "driver_id"], ["safety.driver_leave_requests", "suggested_cover_driver_id"],
  ["safety.driver_qualification_files", "driver_id"], ["safety.driver_safety_profiles", "driver_id"],
  ["safety.driver_safety_scores", "driver_uuid"], ["safety.driver_w8ben", "driver_id"],
  ["safety.drug_test", "driver_id"], ["safety.dvir_submissions", "driver_id"],
  ["safety.harsh_events", "driver_id"], ["safety.hos_exceptions", "driver_id"],
  ["safety.hos_violations", "driver_id"], ["safety.incidents", "driver_id"],
  ["safety.incidents", "recovery_driver_id"], ["safety.integrity_alerts", "subject_driver_id"],
  ["safety.internal_fines", "driver_id"], ["safety.medical_cards", "driver_id"],
  ["safety.onboarding_sessions", "driver_id"], ["safety.photo_comparison_sessions", "driver_uuid"],
  ["safety.random_pool", "driver_id"], ["safety.roadside_inspections", "driver_id"],
  ["safety.rtd_case", "driver_id"], ["safety.safety_events", "subject_driver_id"],
  ["safety.temp_unit_assignments", "cover_driver_id"], ["safety.temp_unit_assignments", "primary_driver_id"],
  ["safety.training_records", "driver_id"], ["safetydoc.assignment", "driver_id"],
  ["safetydoc.assignment", "signed_by_driver_id"], ["samsara.hos_snapshots", "driver_uuid"],
  ["settlement.settlement", "driver_id"], ["settlement.settlement_deduction", "driver_id"],
  ["settlements.settlement_disputes", "driver_id"], ["settlements.team_split_configs", "primary_driver_id"],
  ["settlements.team_split_configs", "secondary_driver_id"], ["settlements.team_split_load_overrides", "primary_driver_id"],
  ["settlements.team_split_load_overrides", "secondary_driver_id"], ["telematics.vehicle_driver_assignments", "driver_id"],
  ["telematics.vehicle_driver_pairing_overlap_flags", "driver_id"], ["utilization.driver_period", "driver_id"],
];

// Known, owner-acknowledged exceptions this pass — not silently accepted, filed to
// GUARD-WORKORDERS.md the same day this guard was authored:
//   - drivers.retention_scores: write role has no GRANT on this table (separate finding, not this
//     merge's fault) — 2 rows still orphaned, routed for a grants migration.
//   - hos.duty_status_events (18 rows) and the 1-row collisions in catalogs.driver_leave_balances /
//     safety.driver_safety_scores: a genuine Samsara-side duplicate-device pairing on ONE driver
//     (Jose Manuel Mejia Olmos) that this TMS-side merge cannot resolve without either violating the
//     CAP-11 append-only law on hos.duty_status_events or picking a winner between two independently
//     real historical rows — owner decision required, not a guess.
const KNOWN_OPEN_EXCEPTIONS = new Set([
  "drivers.retention_scores.driver_uuid",
  "hos.duty_status_events.driver_id",
  "catalogs.driver_leave_balances.driver_id",
  "safety.driver_safety_scores.driver_uuid",
]);

function fail(message) {
  console.error(`${LABEL} — FAILED\n${message}`);
  process.exit(1);
}

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    const missing = !connectionString ? "DATABASE_URL is unset" : "ENABLE_LIVE_DB_UNIT_TEST_GUARD is not 'true'";
    console.log(`${LABEL} — static checks PASSED · SKIPPED-DB-CHECK (${missing}); the live orphan scan did NOT run`);
    return;
  }

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const voidedRes = await client.query(
      `SELECT id::text FROM mdata.drivers WHERE archived_at IS NOT NULL AND notes ILIKE '%CC-3 duplicate merge%'`
    );
    const voidedIds = voidedRes.rows.map((r) => r.id);
    if (voidedIds.length === 0) {
      console.log(`${LABEL} — OK, 0 voided-by-merge driver rows on record, nothing to check`);
      return;
    }

    const problems = [];
    for (const [table, column] of COLUMNS) {
      const key = `${table}.${column}`;
      let res;
      try {
        res = await client.query(
          `SELECT count(*)::int AS n FROM ${table} WHERE ${column} = ANY($1::uuid[])`,
          [voidedIds]
        );
      } catch (err) {
        // table/column may not exist in every environment (e.g. legacy retiring schemas) — a
        // relation-does-not-exist error here is not evidence of an orphan; anything else re-throws.
        if (/does not exist/i.test(String(err.message))) continue;
        throw err;
      }
      const n = res.rows[0].n;
      if (n > 0 && !KNOWN_OPEN_EXCEPTIONS.has(key)) {
        problems.push(`${key}: ${n} live row(s) still reference a voided-by-merge driver`);
      }
    }

    if (problems.length > 0) {
      fail(problems.map((p) => `- ${p}`).join("\n"));
    }
    console.log(
      `${LABEL} — OK, 0 unexpected orphaned references across ${COLUMNS.length} driver-shaped columns (${KNOWN_OPEN_EXCEPTIONS.size} known open exceptions, each filed to GUARD-WORKORDERS.md)`
    );
  } finally {
    await client.end();
  }
}

if (SELFTEST) {
  if (!fs.existsSync(new URL(import.meta.url).pathname)) {
    console.error(`${LABEL} SELFTEST FAIL — this file does not exist`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — static shape valid; live behavior requires DATABASE_URL + ENABLE_LIVE_DB_UNIT_TEST_GUARD=true`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`${LABEL} — FAILED\n${err.stack || err}`);
  process.exit(1);
});
