#!/usr/bin/env node
/**
 * GUARD: the safety schema default ACL grants no DELETE, and safety evidence tables are DELETE-free.
 *
 * WHY THIS EXISTS (owner work order 2026-07-24, Part B)
 * Migration 0065 blanket-granted DELETE on all safety tables AND set the schema DEFAULT PRIVILEGE to
 * `ih35_app=arwd` (the `d` = DELETE), so every NEW safety table inherited DELETE at creation. 61
 * safety tables carried it. void-not-delete evidence records must not be hard-deletable.
 * 202607850000 narrows the default and revokes DELETE on the evidence tables; this guard makes the
 * state permanent — it reads the LIVE database, because a grant/ACL is a property of the database,
 * not of a migration file (asserting on migration text is what let the original gap ship).
 *
 * No reachable DB → CAPABILITY SKIP, exit 0 (verify:static dead-port sentinel). Runs for real in
 * verify:local-ci and against prod.
 */
import { createRequire } from "node:module";

const LABEL = "verify-safety-schema-delete-hardening";

/** Evidence tables that must not carry DELETE. Mirrors the REVOKE list in 202607850000. */
const EVIDENCE_NO_DELETE = [
  "accidents","accident_reports","background_checks","citations","clearinghouse_query","complaints",
  "dot_inspections","driver_documents","driver_leave_days","driver_leave_requests",
  "driver_qualification_files","driver_safety_profiles","driver_w8ben","drug_pool_selections",
  "drug_test","event_documents","fmcsa_events","hos_exceptions","hos_violations","incidents",
  "internal_fines","medical_cards","random_pool","roadside_inspections","rtd_case",
  "temp_unit_assignments","training_programs","training_records","violations","company_violations",
  "permits","da_test_records","da_random_pool_draws","dvir_submissions","dvir_defects",
  "dvir_defect_severity_tags","safety_events","safety_event_notes","integrity_findings",
  "integrity_observations","damage_continuity_chains","photo_comparison_sessions",
  "driver_leave_audit_log","harsh_events","geofence_breach_events","csa_scores",
  "driver_safety_scores","fuel_gps_matches",
  // hardened earlier, included so a regression anywhere trips this too:
  "civil_fines","company_violation_drivers","company_violation_units","company_violation_fines",
];

async function main() {
  const require = createRequire(import.meta.url);
  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = (await import("pg")).default;
  try { (await import("dotenv")).default.config(); } catch { /* optional */ }
  const cs = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!cs) { console.log(`${LABEL} CAPABILITY SKIP — ACL/grants read only from a live DB. CI: verify:local-ci.`); return; }
  const { Client } = pg;
  const client = new Client(buildPgClientConfig(cs, { connectionTimeoutMillis: 15000 }));
  try { await client.connect(); } catch (e) { console.log(`${LABEL} CAPABILITY SKIP — DB unreachable (${e.code ?? e.message}).`); return; }

  const problems = [];
  try {
    // 1. schema default privilege must not grant DELETE (no `d` in the ih35_app ACL entry).
    const { rows: acl } = await client.query(
      `SELECT d.defaclacl::text AS acl FROM pg_default_acl d
         JOIN pg_namespace n ON n.oid=d.defaclnamespace
        WHERE n.nspname='safety' AND d.defaclobjtype='r'`
    );
    for (const r of acl) {
      const entry = (r.acl.match(/ih35_app=([a-zA-Z]+)\//) || [])[1] || "";
      if (entry.includes("d")) {
        problems.push(`safety schema DEFAULT PRIVILEGE still grants DELETE to ih35_app (acl: ${r.acl}). New safety tables would re-inherit DELETE — narrow it (202607850000).`);
      }
    }

    // 2. no evidence table may carry DELETE (only tables that exist here are checked).
    const { rows } = await client.query(
      `SELECT table_name, string_agg(privilege_type, ',') AS g
         FROM information_schema.role_table_grants
        WHERE table_schema='safety' AND grantee='ih35_app' AND table_name = ANY($1)
        GROUP BY table_name`,
      [EVIDENCE_NO_DELETE]
    );
    for (const r of rows) {
      if (r.g.split(",").includes("DELETE")) {
        problems.push(`safety.${r.table_name}: ih35_app holds DELETE (${r.g}) — evidence/void-not-delete table. REVOKE it (202607850000).`);
      }
    }
    const checked = rows.length;
    if (problems.length) {
      console.error(`${LABEL} FAILED:`);
      for (const p of problems) console.error(`  ${p}`);
      process.exit(1);
    }
    console.log(`${LABEL} OK — safety default ACL grants no DELETE; ${checked} evidence table(s) verified DELETE-free against the LIVE ACL.`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => { console.error(`${LABEL} FAILED — ${e.message}`); process.exit(1); });
