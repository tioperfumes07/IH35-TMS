#!/usr/bin/env node
// GUARD — verify-no-driver-merge-without-hard-identifier (ROUND E23, Q16, DEVIN-B)
//
// A driver merge must be backed by at least one HARD identifier match — CDL number,
// passport number, INE number, CURP, Samsara driver ID, QBO vendor ID, or employee
// ID. Name similarity alone is NOT sufficient to merge two driver records. The
// 33-pair duplicate-driver merge (2026-09-03) was backed by hard identifiers; this
// guard ensures no future merge happens on name alone.
//
// This guard checks the mdata.driver_vendor_merges table for merge records that
// lack a hard-identifier match. A merge record without at least one shared hard
// identifier between the from- and to- drivers is a name-only merge — a defect.
//
// Hard identifiers (at least one must match between from/to driver):
//   cdl_number, passport_number, ine_number, curp, samsara_driver_id,
//   qbo_vendor_id, employee_id_display
//
// BASELINE 0 (shrink-only): the expected violation count is 0. Any merge without
// a hard identifier fails. --write-baseline is FORBIDDEN. Self-arming — as new
// merges are created, the guard checks them all.
//
// LIVE guard (REQUIRES_LIVE_DB): touches driver identity data. Uses
// requireLiveDbOrExit and declares REQUIRES_LIVE_DB. Wired into
// money-pr-local-gate.mjs LIVE_DOMAIN_GUARDS. Fails closed without DATABASE_URL.
//
// Self-test: node scripts/verify-no-driver-merge-without-hard-identifier.mjs --selftest
export const REQUIRES_LIVE_DB = "driver identity (merge records) — must fail-closed, never skip, per ROUND 29.9-B";

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-no-driver-merge-without-hard-identifier";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Hard identifiers that must match between from/to driver for a merge to be valid
const HARD_IDENTIFIER_COLUMNS = [
  "cdl_number",
  "passport_number",
  "ine_number",
  "curp",
  "samsara_driver_id",
  "qbo_vendor_id",
  "employee_id_display",
];

/**
 * Classify a merge record. Pure function — exported for selftest.
 * @param {{ from_driver: object, to_driver: object }} row
 * @returns {string|null} violation kind, or null if clean
 */
export function classifyDriverMerge(row) {
  const { from_driver, to_driver } = row;
  if (!from_driver || !to_driver) return "missing_driver_record";

  // At least one hard identifier must match (both non-null and equal)
  const hasHardMatch = HARD_IDENTIFIER_COLUMNS.some(
    (col) =>
      from_driver[col] &&
      to_driver[col] &&
      String(from_driver[col]).trim().toLowerCase() ===
        String(to_driver[col]).trim().toLowerCase(),
  );

  if (!hasHardMatch) return "name_only_merge_no_hard_identifier";
  return null;
}

/**
 * Query all USMCA driver merge records and check for hard-identifier matches.
 * Runs inside a transaction with bypass_rls='lucia' (USMCA scope only).
 * @param {import("pg").PoolClient} client
 * @returns {Promise<Array>}
 */
async function measure(client) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

  // Get all driver_vendor_merges for USMCA
  const mergeRes = await client.query(
    `SELECT m.id::text AS merge_id, m.from_driver_id, m.to_driver_id
       FROM mdata.driver_vendor_merges m
      WHERE m.operating_company_id = $1::uuid
      ORDER BY m.created_at`,
    [USMCA_COMPANY_ID],
  );

  const results = [];
  for (const merge of mergeRes.rows) {
    // Get from_driver
    const fromRes = await client.query(
      `SELECT ${HARD_IDENTIFIER_COLUMNS.join(", ")}
         FROM mdata.drivers
        WHERE id = $1::uuid`,
      [merge.from_driver_id],
    );
    // Get to_driver
    const toRes = await client.query(
      `SELECT ${HARD_IDENTIFIER_COLUMNS.join(", ")}
         FROM mdata.drivers
        WHERE id = $1::uuid`,
      [merge.to_driver_id],
    );

    results.push({
      merge_id: merge.merge_id,
      from_driver: fromRes.rows[0] || null,
      to_driver: toRes.rows[0] || null,
    });
  }

  await client.query("ROLLBACK");
  return results;
}

function runSelftest() {
  const fixtures = [
    // Clean: CDL matches
    {
      name: "merge with matching CDL",
      row: {
        from_driver: { cdl_number: "TX12345", passport_number: null, ine_number: null, curp: null, samsara_driver_id: null, qbo_vendor_id: null, employee_id_display: null },
        to_driver: { cdl_number: "TX12345", passport_number: null, ine_number: null, curp: null, samsara_driver_id: null, qbo_vendor_id: null, employee_id_display: null },
      },
      expect: null,
    },
    // Clean: Samsara ID matches
    {
      name: "merge with matching Samsara ID",
      row: {
        from_driver: { cdl_number: null, passport_number: null, ine_number: null, curp: null, samsara_driver_id: "sam-001", qbo_vendor_id: null, employee_id_display: null },
        to_driver: { cdl_number: null, passport_number: null, ine_number: null, curp: null, samsara_driver_id: "sam-001", qbo_vendor_id: null, employee_id_display: null },
      },
      expect: null,
    },
    // RED: name-only merge, no hard identifier
    {
      name: "name-only merge — no hard identifier",
      row: {
        from_driver: { cdl_number: null, passport_number: null, ine_number: null, curp: null, samsara_driver_id: null, qbo_vendor_id: null, employee_id_display: null },
        to_driver: { cdl_number: null, passport_number: null, ine_number: null, curp: null, samsara_driver_id: null, qbo_vendor_id: null, employee_id_display: null },
      },
      expect: "name_only_merge_no_hard_identifier",
    },
    // RED: CDL numbers don't match
    {
      name: "merge with non-matching CDLs",
      row: {
        from_driver: { cdl_number: "TX12345", passport_number: null, ine_number: null, curp: null, samsara_driver_id: null, qbo_vendor_id: null, employee_id_display: null },
        to_driver: { cdl_number: "TX67890", passport_number: null, ine_number: null, curp: null, samsara_driver_id: null, qbo_vendor_id: null, employee_id_display: null },
      },
      expect: "name_only_merge_no_hard_identifier",
    },
    // Clean: CURP matches (Mexican driver)
    {
      name: "merge with matching CURP",
      row: {
        from_driver: { cdl_number: null, passport_number: null, ine_number: null, curp: "ABCD123456HDFLMN01", samsara_driver_id: null, qbo_vendor_id: null, employee_id_display: null },
        to_driver: { cdl_number: null, passport_number: null, ine_number: null, curp: "ABCD123456HDFLMN01", samsara_driver_id: null, qbo_vendor_id: null, employee_id_display: null },
      },
      expect: null,
    },
    // RED: missing driver record
    {
      name: "merge with missing from_driver",
      row: { from_driver: null, to_driver: { cdl_number: "TX12345" } },
      expect: "missing_driver_record",
    },
  ];

  let pass = 0;
  let fail = 0;
  for (const { name, row, expect: exp } of fixtures) {
    const got = classifyDriverMerge(row);
    if (got !== exp) {
      console.error(`${LABEL} --selftest FAIL — ${name}: expected ${exp}, got ${got}`);
      fail += 1;
    } else {
      pass += 1;
    }
  }
  if (fail > 0) {
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} --selftest PASS — ${pass} classifier fixtures all correct`);
  }
}

async function run({ selftest }) {
  if (selftest) {
    runSelftest();
    if (process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL) {
      const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
      try {
        const rows = await measure(client);
        const violations = rows.filter((r) => classifyDriverMerge(r) !== null);
        console.log(
          `${LABEL} --selftest LIVE — scanned ${rows.length} driver merge(s) for USMCA, ${violations.length} violation(s)`,
        );
      } finally {
        client.release();
        await pool.end();
      }
    }
    return;
  }

  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const rows = await measure(client);
    const violations = [];
    for (const row of rows) {
      const kind = classifyDriverMerge(row);
      if (kind) violations.push({ id: row.merge_id, kind });
    }

    if (violations.length > 0) {
      const sample = violations.slice(0, 10).map((v) => `  ${v.id} [${v.kind}]`).join("\n");
      console.error(
        `${LABEL}: LIVE FAIL — ${violations.length} driver merge(s) without hard identifier.\n` +
          `First ${Math.min(10, violations.length)}:\n${sample}\n` +
          `A driver merge requires at least one hard identifier match (CDL, passport, INE, CURP, Samsara ID, QBO vendor ID, or employee ID).`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`${LABEL}: LIVE PASS — ${rows.length} USMCA driver merge(s) scanned, 0 without hard identifier. Baseline 0 held.`);
  } finally {
    client.release();
    await pool.end();
  }
}

await run({ selftest: process.argv.includes("--selftest") });
