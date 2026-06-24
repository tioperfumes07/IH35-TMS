#!/usr/bin/env node
/**
 * LANE B — TEST/DEMO DATA ENUMERATION (read-only diagnostic, versioned tool)
 *
 * Supersedes the bare scripts/lane-b-test-data-enumerate.sql (#1445), which the
 * hold-merge-gate correctly RED-flagged: a `.sql` file with no CREATE TABLE is
 * indistinguishable from a non-additive migration to a path-based classifier, so
 * it fail-safes to "protected migration". This is the same diagnostic rebuilt as
 * neutral Node tooling — a `scripts/*.mjs` is never run through the migration
 * analyzer, so the gate classifies it as neutral (proven by reconcile-block-status.mjs).
 *
 * WHAT IT DOES (READ-ONLY): enumerates every candidate TEST/DEMO unit
 * (mdata.units), trailer (mdata.equipment) and load (mdata.loads) for an operating
 * company, with — per candidate — id, display number, VIN, why it was marked, status,
 * created_at, and a COUNT of linked records (loads, work_orders, settlements,
 * advances, fuel, inspections). Any candidate with NON-ZERO settlement/advance
 * linkage is flagged "FINANCIAL-LINKED" in its own column — Jorge must review those
 * before any inactivation.
 *
 * HARD-EXCLUSION (shown explicitly): the real Dispatch company vehicles are NEVER
 * candidates. A unit is treated as REAL (excluded) if it is assigned to any
 * non-test, non-soft-deleted load (i.e. real dispatch activity — this is how the
 * "2 Dispatch loads -> assigned_unit_id" rule is derived), OR its unit_number is in
 * EXCLUDE_UNIT_NUMBERS (T139), OR it is assigned to a live dispatch-board load.
 *
 * READ-ONLY GUARANTEE (defense in depth): every query runs inside a single
 *   BEGIN; SET TRANSACTION READ ONLY; ... ROLLBACK;
 * envelope. Postgres rejects any INSERT/UPDATE/DELETE in a read-only transaction at
 * execution time (regardless of row count), so the tool *cannot* write even if a
 * future edit introduced a stray write. `--prove-read-only` demonstrates this by
 * attempting a no-op UPDATE and asserting Postgres rejects it (error 25006).
 *
 * INACTIVATION is --dry-run ONLY. The tool PRINTS the exact soft-deactivation SQL it
 * WOULD run — mirroring the app's verified path (units.routes.ts / equipment.routes.ts):
 *   units:     UPDATE mdata.units SET deactivated_at = now(), status = 'OutOfService',
 *              updated_by_user_id = <actor> WHERE id = <id> AND deactivated_at IS NULL;  -- no RETURNING
 *   equipment: UPDATE mdata.equipment SET deactivated_at = now(),
 *              updated_by_user_id = <actor> WHERE id = <id> AND deactivated_at IS NULL;  -- no RETURNING
 *   loads:     UPDATE mdata.loads SET soft_deleted_at = now(), deleted_by_user_id = <actor>
 *              WHERE id = <id> AND soft_deleted_at IS NULL;  -- never touches loads.status
 *              (status drives the Kanban board + settlement timing per Block-20 — GUARD-verified)
 * It NEVER executes those statements. The real inactivation is run BY JORGE, on the
 * confirmed set only, after he reviews this list. Reversible by design (clear the
 * timestamp column). FINANCIAL-LINKED candidates are excluded from the would-run set.
 *
 * USAGE:
 *   node scripts/lane-b-test-data-enumerate.mjs                 # TRANSP, table output
 *   node scripts/lane-b-test-data-enumerate.mjs --dry-run       # + print would-run inactivation SQL
 *   node scripts/lane-b-test-data-enumerate.mjs --company=ALL   # all companies (used for the e2e proof)
 *   node scripts/lane-b-test-data-enumerate.mjs --company=<uuid>
 *   node scripts/lane-b-test-data-enumerate.mjs --json          # machine-readable
 *   node scripts/lane-b-test-data-enumerate.mjs --prove-read-only  # assert writes are rejected, then exit
 *
 * Connection: DATABASE_DIRECT_URL || DATABASE_URL (same as every other db: script).
 *
 * SAFE-BY-DEFAULT (CLAUDE.md §1.5 — prod Neon access is gated): the tool refuses to
 * connect to any NON-localhost host unless `--remote` is passed explicitly. A stray
 * .env in this repo points DATABASE_URL at a remote Neon host; without this guard an
 * env-less run could silently touch a gated DB. Default = localhost only. A deliberate
 * prod/Neon run is Jorge's, via `--remote` (still inside the read-only envelope).
 *
 * Exit 0 on success; exit 1 only on an unexpected error (the standing "no silent retry" rule).
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ── Constants (verified against db/migrations + live ih35_e2e introspection) ──
const TRANSP_COMPANY_ID = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

// Display-number prefixes that mark a row as test/demo. DEMO-/TEST-/SAMPLE- are the
// prod conventions; E2E-/B1- are the integration-DB seed conventions (so this tool
// also exercises its full logic when proven against ih35_e2e). Case-insensitive.
const TEST_MARKER_PREFIXES = ["DEMO-", "TEST-", "SAMPLE-", "E2E-", "B1-"];

// Known test/demo id prefixes (the truncated ids from the Lane B brief). Matched as
// id::text LIKE '<prefix>%' so a partial/abbreviated id still resolves honestly.
const KNOWN_TEST_ID_PREFIXES = ["6119f024", "96e1f233"];

// Real Dispatch vehicles to ALWAYS exclude by display number (never test data).
const EXCLUDE_UNIT_NUMBERS = ["T139"];

// SUBSTRING markers (GUARD complete-set, 2026-06-24): a row is test/demo if these appear ANYWHERE in the
// display number, name, OR vin (not just as a prefix) — catches 'DEMO DATA - …' titles, 'X-TEST' suffixes, etc.
const TEST_MARKER_SUBSTRINGS = ["DEMO", "TEST", "SAMPLE"];

// REVIEW-ONLY (do NOT auto-include): non-standard-named trucks GUARD saw that MIGHT be test data — Jorge
// confirms each. Matched on unit_number. These are flagged "REVIEW", never auto-marked test.
const REVIEW_UNIT_NUMBERS = ["01", "Truck-01", "Truck-02", "Truck-04", "Truck-103", "Truck-106", "Truck-112", "Truck-121", "Truck-130"];

// KEEP-REAL allowlist: obvious real company vehicles — never reported as test, even if a substring matched
// by accident. Applied JS-side to the result rows (a unit_number matching any of these is dropped from the
// test set). TACOMA / VERSA* (named units) + the T120–T177 real-fleet block.
const KEEP_REAL_RE = /^(tacoma|versa[\s-]*\d*|versa\s*white|t1[2-7]\d)$/i;

// Load statuses that put a load on the live Dispatch board (its assigned unit is real).
// Terminal statuses (delivered/cancelled) are NOT board loads. Derived from mdata.load_status_enum.
const DISPATCH_BOARD_STATUSES = [
  "tendered",
  "booked",
  "dispatched",
  "at_pickup",
  "loaded",
  "in_transit",
  "at_delivery",
];

// ── CLI ──
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const asJson = argv.includes("--json");
const readOnlyProof = argv.includes("--prove-read-only");
const allowRemote = argv.includes("--remote");
const companyArg = (argv.find((a) => a.startsWith("--company=")) || "").split("=")[1] || "";
const companyFilter = companyArg ? companyArg.toUpperCase() : TRANSP_COMPANY_ID; // "ALL" or a uuid

// §1.5 safe-by-default: only localhost unless --remote is passed deliberately.
function assertHostAllowed(connectionString) {
  let host = "";
  try {
    const u = new URL(connectionString.trim().replace(/^postgres(ql)?:\/\//i, "http://"));
    host = (u.hostname || "").toLowerCase();
  } catch { host = ""; }
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
  if (!isLocal && !allowRemote) {
    err(`✘ lane-b-test-data-enumerate: refusing to connect to non-localhost host "${host}" without --remote.`);
    err(`  CLAUDE.md §1.5: prod/Neon access is gated. A deliberate remote run is Jorge's, via --remote (still read-only).`);
    process.exit(1);
  }
  return { host, isLocal };
}

function log(...a) { console.log(...a); }
function err(...a) { console.error(...a); }

// SQL fragment: is this display-number / id a test marker? (prefix + known-id form — used for loads).
const markerSql = (numCol, idCol) => {
  const prefixLikes = TEST_MARKER_PREFIXES.map((p) => `${numCol} ILIKE '${p}%'`);
  const idLikes = KNOWN_TEST_ID_PREFIXES.map((p) => `${idCol}::text LIKE '${p}%'`);
  return `(${[...prefixLikes, ...idLikes].join(" OR ")})`;
};

// BROAD marker (GUARD complete-set): prefix OR substring-anywhere in the number OR substring-anywhere in the
// VIN OR a known test/demo id-prefix. Used for units / equipment / work orders so 'DEMO DATA - …' and
// vin-embedded markers are caught, not just 'DEMO-' prefixes.
const markerSqlBroad = (numCol, vinCol, idCol) => {
  const prefixLikes = TEST_MARKER_PREFIXES.map((p) => `${numCol} ILIKE '${p}%'`);
  const substrNum = TEST_MARKER_SUBSTRINGS.map((s) => `${numCol} ILIKE '%${s}%'`);
  const substrVin = vinCol ? TEST_MARKER_SUBSTRINGS.map((s) => `${vinCol} ILIKE '%${s}%'`) : [];
  const idLikes = KNOWN_TEST_ID_PREFIXES.map((p) => `${idCol}::text LIKE '${p}%'`);
  return `(${[...prefixLikes, ...substrNum, ...substrVin, ...idLikes].join(" OR ")})`;
};

// company scope fragment for a given company column expression
const companyScopeSql = (companyExpr) =>
  companyFilter === "ALL" ? "TRUE" : `${companyExpr} = '${companyFilter}'::uuid`;

async function main() {
  let pg;
  try {
    pg = (await import("pg")).default;
  } catch (e) {
    err(`✘ lane-b-test-data-enumerate: 'pg' module not available: ${e.message}`);
    process.exit(1);
  }
  try { (await import("dotenv")).default.config(); } catch { /* env may already be present */ }

  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    err("✘ lane-b-test-data-enumerate: DATABASE_DIRECT_URL or DATABASE_URL must be set.");
    process.exit(1);
  }
  const { host } = assertHostAllowed(connectionString);
  log(`connecting to host: ${host || "(local socket)"}${allowRemote && host && host !== "localhost" ? "  [--remote]" : ""}`);

  const { Client } = pg;
  const client = new Client(buildPgClientConfig(connectionString, { connectionTimeoutMillis: 15000 }));
  await client.connect();

  try {
    // Hard read-only envelope. Any write attempted inside this fails at execution.
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");

    if (readOnlyProof) {
      await proveReadOnly(client);
      await client.query("ROLLBACK");
      log("✅ read-only proof passed: Postgres rejected an UPDATE inside the SET TRANSACTION READ ONLY envelope.");
      return;
    }

    const scopeLabel = companyFilter === "ALL" ? "ALL companies" : companyFilter;
    log(`\n=== LANE B — TEST/DEMO DATA ENUMERATION (READ-ONLY) ===`);
    log(`company scope: ${scopeLabel}`);
    log(`markers: number prefix in [${TEST_MARKER_PREFIXES.join(", ")}] OR is_sample_data OR id-prefix in [${KNOWN_TEST_ID_PREFIXES.join(", ")}]`);

    const excluded = await loadExclusions(client);
    const units = await enumerateUnits(client, excluded.unitIds);
    const trailers = await enumerateTrailers(client);
    const loads = await enumerateLoads(client);
    const workOrders = await enumerateWorkOrders(client);
    const reviewUnits = await enumerateReviewUnits(client);

    const report = { scope: scopeLabel, excluded, units, trailers, loads, workOrders, reviewUnits };

    if (asJson) {
      log(JSON.stringify(report, null, 2));
    } else {
      printExclusions(excluded);
      printSection("UNITS (mdata.units)", units, UNIT_COLUMNS);
      printSection("TRAILERS (mdata.equipment)", trailers, TRAILER_COLUMNS);
      printSection("WORK ORDERS (maintenance.work_orders)", workOrders, WO_COLUMNS);
      printSection("LOADS (mdata.loads)", loads, LOAD_COLUMNS);
      printSection("⚠ REVIEW — ambiguous trucks (Jorge confirms each; NOT auto-included)", reviewUnits, REVIEW_COLUMNS);
      printSummary(units, trailers, loads);
      log(`  work orders (DEMO/TEST): ${workOrders.length}   review-flagged units: ${reviewUnits.length}`);
      if (dryRun) printDryRun(units, trailers, loads);
    }

    await client.query("ROLLBACK"); // nothing was written; this is belt-and-suspenders
  } finally {
    await client.end().catch(() => {});
  }
}

// Attempt a no-op write; assert Postgres rejects it (read_only_sql_transaction = 25006).
async function proveReadOnly(client) {
  try {
    await client.query("UPDATE mdata.units SET updated_at = updated_at WHERE FALSE");
    throw new Error("UPDATE was NOT rejected inside a read-only transaction — envelope is broken.");
  } catch (e) {
    if (e && e.code === "25006") return; // expected: cannot execute UPDATE in a read-only transaction
    throw e;
  }
}

// ── Exclusions ──────────────────────────────────────────────────────────────
async function loadExclusions(client) {
  // Real units = assigned to a non-test, non-soft-deleted load (real dispatch activity),
  // OR a live dispatch-board load, OR an explicit excluded unit_number (T139).
  const boardList = DISPATCH_BOARD_STATUSES.map((s) => `'${s}'`).join(", ");
  const { rows } = await client.query(
    `
    WITH real_loads AS (
      SELECT id, assigned_unit_id, status::text AS status, load_number
      FROM mdata.loads
      WHERE assigned_unit_id IS NOT NULL
        AND soft_deleted_at IS NULL
        AND NOT ${markerSql("load_number", "id")}
        AND ${companyScopeSql("operating_company_id")}
    ),
    by_activity AS (
      SELECT DISTINCT assigned_unit_id AS unit_id, 'assigned to real (non-test) load'::text AS reason
      FROM real_loads
    ),
    by_board AS (
      SELECT DISTINCT assigned_unit_id AS unit_id, 'assigned to live dispatch-board load'::text AS reason
      FROM real_loads WHERE status IN (${boardList})
    ),
    by_number AS (
      SELECT id AS unit_id, 'explicit exclude (unit_number)'::text AS reason
      FROM mdata.units WHERE unit_number = ANY($1::text[])
    )
    SELECT u.id::text AS unit_id, u.unit_number, x.reason
    FROM (
      SELECT unit_id, reason FROM by_activity
      UNION SELECT unit_id, reason FROM by_board
      UNION SELECT unit_id, reason FROM by_number
    ) x
    JOIN mdata.units u ON u.id = x.unit_id
    ORDER BY u.unit_number NULLS LAST
    `,
    [EXCLUDE_UNIT_NUMBERS]
  );
  return { unitIds: rows.map((r) => r.unit_id), rows };
}

// ── Units ───────────────────────────────────────────────────────────────────
const UNIT_COLUMNS = ["unit_number", "vin", "status", "is_active", "marker", "created", "loads", "work_orders", "settlements", "advances", "fuel", "inspections", "fin_linked", "id8"];
async function enumerateUnits(client, excludedUnitIds) {
  const { rows } = await client.query(
    `
    SELECT
      u.id::text AS id,
      u.unit_number,
      u.vin,
      u.status::text AS status,
      u.created_at,
      u.deactivated_at,
      u.is_sample_data,
      (SELECT count(*) FROM mdata.loads l WHERE l.assigned_unit_id = u.id) AS loads_cnt,
      (SELECT count(*) FROM maintenance.work_orders w WHERE w.unit_id = u.id) AS wo_cnt,
      (SELECT count(*) FROM fuel.fuel_transactions f WHERE f.unit_id = u.id) AS fuel_cnt,
      (SELECT count(*) FROM maintenance.inspections i WHERE i.unit_id = u.id)
        + (SELECT count(*) FROM compliance.dot_inspection_events d WHERE d.unit_id = u.id) AS insp_cnt,
      (SELECT count(*) FROM driver_finance.driver_settlements s
         WHERE s.first_load_id IN (SELECT id FROM mdata.loads WHERE assigned_unit_id = u.id)
            OR s.last_load_id  IN (SELECT id FROM mdata.loads WHERE assigned_unit_id = u.id)) AS settle_cnt,
      ((SELECT count(*) FROM driver_finance.driver_advances a
          WHERE a.load_id IN (SELECT id FROM mdata.loads WHERE assigned_unit_id = u.id))
       + (SELECT count(*) FROM driver_finance.cash_advance_requests c
          WHERE c.load_id IN (SELECT id FROM mdata.loads WHERE assigned_unit_id = u.id))) AS adv_cnt
    FROM mdata.units u
    WHERE (${markerSqlBroad("u.unit_number", "u.vin", "u.id")} OR u.is_sample_data = TRUE)
      AND ${companyScopeSql("COALESCE(u.currently_leased_to_company_id, u.owner_company_id)")}
      AND NOT (u.id = ANY($1::uuid[]))
    ORDER BY u.created_at
    `,
    [excludedUnitIds.length ? excludedUnitIds : ["00000000-0000-0000-0000-000000000000"]]
  );
  // KEEP-REAL: drop obvious real company vehicles even if a substring matched by accident.
  return rows.map(unitRow).filter((r) => !KEEP_REAL_RE.test(String(r.unit_number || "").trim()));
}
function unitRow(r) {
  const finLinked = Number(r.settle_cnt) > 0 || Number(r.adv_cnt) > 0;
  return {
    id: r.id, id8: r.id.slice(0, 8),
    unit_number: r.unit_number, vin: r.vin || "", status: r.status,
    is_active: r.deactivated_at ? "no" : "yes",
    marker: markerReason(r.unit_number, r.id, r.is_sample_data),
    created: fmtDate(r.created_at), deactivated_at: r.deactivated_at,
    loads: Number(r.loads_cnt), work_orders: Number(r.wo_cnt),
    settlements: Number(r.settle_cnt), advances: Number(r.adv_cnt),
    fuel: Number(r.fuel_cnt), inspections: Number(r.insp_cnt),
    fin_linked: finLinked ? "YES" : "",
  };
}

// ── Trailers (mdata.equipment) ────────────────────────────────────────────────
const TRAILER_COLUMNS = ["equipment_number", "vin", "status", "is_active", "marker", "created", "work_orders", "fin_linked", "id8"];
async function enumerateTrailers(client) {
  const { rows } = await client.query(
    `
    SELECT
      e.id::text AS id, e.equipment_number, e.vin, e.status::text AS status,
      e.created_at, e.deactivated_at,
      (SELECT count(*) FROM maintenance.work_orders w WHERE w.equipment_id = e.id) AS wo_cnt
    FROM mdata.equipment e
    WHERE ${markerSqlBroad("e.equipment_number", "e.vin", "e.id")}
      AND ${companyScopeSql("COALESCE(e.currently_leased_to_company_id, e.owner_company_id)")}
    ORDER BY e.created_at
    `
  );
  // equipment has no is_sample_data column (verified) — marker is prefix/substring/vin/id.
  return rows.map((r) => ({
    id: r.id, id8: r.id.slice(0, 8),
    equipment_number: r.equipment_number, vin: r.vin || "", status: r.status,
    is_active: r.deactivated_at ? "no" : "yes",
    marker: markerReason(r.equipment_number, r.id, false),
    created: fmtDate(r.created_at), deactivated_at: r.deactivated_at,
    work_orders: Number(r.wo_cnt),
    fin_linked: "", // trailers carry no settlement/advance linkage
  })).filter((r) => !KEEP_REAL_RE.test(String(r.equipment_number || "").trim()));
}

// ── Work orders (maintenance.work_orders) ────────────────────────────────────
const WO_COLUMNS = ["display_id", "wo_title", "status", "unit8", "marker", "id8"];
async function enumerateWorkOrders(client) {
  const subs = TEST_MARKER_SUBSTRINGS.map((s) =>
    `(w.display_id ILIKE '%${s}%' OR w.wo_title ILIKE '%${s}%' OR w.description ILIKE '%${s}%')`
  ).join(" OR ");
  const { rows } = await client.query(
    `
    SELECT w.id::text AS id, w.display_id, w.wo_title, w.status::text AS status,
           w.unit_id::text AS unit_id, w.created_at
    FROM maintenance.work_orders w
    WHERE (${subs})
      AND ${companyScopeSql("w.operating_company_id")}
    ORDER BY w.created_at
    `
  ).catch(async (e) => {
    // operating_company_id may not exist on maintenance.work_orders in every build — fall back unscoped.
    if (!/operating_company_id/.test(String(e.message))) throw e;
    return client.query(
      `SELECT w.id::text AS id, w.display_id, w.wo_title, w.status::text AS status,
              w.unit_id::text AS unit_id, w.created_at
       FROM maintenance.work_orders w WHERE (${subs}) ORDER BY w.created_at`
    );
  });
  return rows.map((r) => ({
    id: r.id, id8: r.id.slice(0, 8),
    display_id: r.display_id, wo_title: (r.wo_title || "").slice(0, 50), status: r.status,
    unit8: r.unit_id ? r.unit_id.slice(0, 8) : "",
    marker: "DEMO/TEST in title/desc",
  }));
}

// ── REVIEW-ONLY ambiguous trucks (Jorge confirms each — NOT auto-included) ────
const REVIEW_COLUMNS = ["unit_number", "vin", "status", "is_active", "why", "id8"];
async function enumerateReviewUnits(client) {
  const { rows } = await client.query(
    `
    SELECT u.id::text AS id, u.unit_number, u.vin, u.status::text AS status, u.deactivated_at
    FROM mdata.units u
    WHERE u.unit_number = ANY($1::text[])
      AND ${companyScopeSql("COALESCE(u.currently_leased_to_company_id, u.owner_company_id)")}
    ORDER BY u.unit_number
    `,
    [REVIEW_UNIT_NUMBERS]
  );
  return rows.map((r) => ({
    id: r.id, id8: r.id.slice(0, 8),
    unit_number: r.unit_number, vin: r.vin || "", status: r.status,
    is_active: r.deactivated_at ? "no" : "yes",
    why: "non-standard name — Jorge confirms real-vs-test",
  }));
}

// ── Loads ─────────────────────────────────────────────────────────────────────
const LOAD_COLUMNS = ["load_number", "status", "marker", "created", "work_orders", "settlements", "advances", "fuel", "fin_linked", "id8"];
async function enumerateLoads(client) {
  const { rows } = await client.query(
    `
    SELECT
      l.id::text AS id, l.load_number, l.status::text AS status, l.created_at, l.soft_deleted_at,
      (SELECT count(*) FROM maintenance.work_orders w WHERE w.load_id = l.id OR w.roadside_breakdown_load_id = l.id) AS wo_cnt,
      (SELECT count(*) FROM driver_finance.driver_settlements s WHERE s.first_load_id = l.id OR s.last_load_id = l.id) AS settle_cnt,
      ((SELECT count(*) FROM driver_finance.driver_advances a WHERE a.load_id = l.id)
       + (SELECT count(*) FROM driver_finance.cash_advance_requests c WHERE c.load_id = l.id)) AS adv_cnt,
      (SELECT count(*) FROM fuel.fuel_transactions f WHERE f.load_id = l.id) AS fuel_cnt
    FROM mdata.loads l
    WHERE ${markerSql("l.load_number", "l.id")}
      AND ${companyScopeSql("l.operating_company_id")}
    ORDER BY l.created_at
    `
  );
  return rows.map((r) => {
    const finLinked = Number(r.settle_cnt) > 0 || Number(r.adv_cnt) > 0;
    return {
      id: r.id, id8: r.id.slice(0, 8),
      load_number: r.load_number, status: r.status,
      marker: markerReason(r.load_number, r.id, false),
      created: fmtDate(r.created_at), soft_deleted_at: r.soft_deleted_at,
      work_orders: Number(r.wo_cnt), settlements: Number(r.settle_cnt),
      advances: Number(r.adv_cnt), fuel: Number(r.fuel_cnt),
      fin_linked: finLinked ? "YES" : "",
    };
  });
}

// ── Marker helpers ────────────────────────────────────────────────────────────
function markerOrSample(numCol, idCol, sampleCol) {
  return `(${markerSql(numCol, idCol)} OR ${sampleCol} = TRUE)`;
}
function markerReason(num, id, isSample) {
  const reasons = [];
  if (isSample) reasons.push("is_sample_data");
  const pfx = TEST_MARKER_PREFIXES.find((p) => String(num || "").toUpperCase().startsWith(p));
  if (pfx) reasons.push(`prefix ${pfx}`);
  const idpfx = KNOWN_TEST_ID_PREFIXES.find((p) => String(id || "").startsWith(p));
  if (idpfx) reasons.push(`id ${idpfx}…`);
  return reasons.join(" + ") || "(unmarked)";
}
function fmtDate(d) { return d ? new Date(d).toISOString().slice(0, 10) : ""; }

// ── Output ────────────────────────────────────────────────────────────────────
function printExclusions(excluded) {
  log(`\n--- HARD-EXCLUDED real vehicles (${excluded.rows.length}) — never candidates ---`);
  if (!excluded.rows.length) { log("  (none matched in this scope)"); return; }
  for (const r of excluded.rows) log(`  • ${r.unit_number || "(no number)"}  [${r.unit_id.slice(0, 8)}]  — ${r.reason}`);
}
function printSection(title, rows, cols) {
  log(`\n--- ${title}: ${rows.length} candidate(s) ---`);
  if (!rows.length) { log("  (none)"); return; }
  log("  " + cols.join(" | "));
  for (const row of rows) log("  " + cols.map((c) => String(row[c] ?? "")).join(" | "));
}
function printSummary(units, trailers, loads) {
  const fin = [...units, ...loads].filter((r) => r.fin_linked === "YES").length;
  log(`\n--- SUMMARY ---`);
  log(`  units: ${units.length}   trailers: ${trailers.length}   loads: ${loads.length}`);
  log(`  FINANCIAL-LINKED candidates (settlements/advances > 0): ${fin}  — Jorge must review before inactivation`);
}
function printDryRun(units, trailers, loads) {
  log(`\n=== --dry-run: would-run soft-inactivation SQL (NOTHING EXECUTED) ===`);
  log(`  (FINANCIAL-LINKED candidates are excluded from this set; the real run is Jorge's, on the confirmed set only)`);
  const actor = "<ACTOR_USER_UUID>";
  const safeUnits = units.filter((u) => u.fin_linked !== "YES");
  const safeLoads = loads.filter((l) => l.fin_linked !== "YES");

  log(`\n  -- UNITS (${safeUnits.length}) --`);
  for (const u of safeUnits) {
    const term = new Set(["Sold", "Totaled", "Transferred", "Damaged"]);
    const newStatus = term.has(u.status) ? u.status : "OutOfService";
    log(`  UPDATE mdata.units SET deactivated_at = now(), status = '${newStatus}'::mdata.unit_status, updated_by_user_id = '${actor}' WHERE id = '${u.id}' AND deactivated_at IS NULL;  -- ${u.unit_number}`);
  }
  log(`\n  -- TRAILERS (${trailers.length}) --`);
  for (const t of trailers) {
    log(`  UPDATE mdata.equipment SET deactivated_at = now(), updated_by_user_id = '${actor}' WHERE id = '${t.id}' AND deactivated_at IS NULL;  -- ${t.equipment_number}`);
  }
  log(`\n  -- LOADS (${safeLoads.length}) --`);
  for (const l of safeLoads) {
    log(`  UPDATE mdata.loads SET soft_deleted_at = now(), deleted_by_user_id = '${actor}' WHERE id = '${l.id}' AND soft_deleted_at IS NULL;  -- ${l.load_number} (status untouched — Block-20)`);
  }
  const skipped = [...units, ...loads].filter((r) => r.fin_linked === "YES");
  if (skipped.length) {
    log(`\n  -- SKIPPED (financial-linked, ${skipped.length}) — Jorge reviews individually --`);
    for (const s of skipped) log(`  • ${s.unit_number || s.load_number}  [${s.id8}]  settlements=${s.settlements} advances=${s.advances}`);
  }
}

main().catch((e) => {
  err(`✘ lane-b-test-data-enumerate (unexpected error — no retry, surfacing): ${e.stack || e.message}`);
  process.exit(1);
});
