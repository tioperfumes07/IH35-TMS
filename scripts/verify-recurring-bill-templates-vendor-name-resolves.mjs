#!/usr/bin/env node
/**
 * FINDING: LV-RECURRING-BILLS-VENDOR-NOT-VISIBLE (carries ACCT-F5396) — found live 2026-08-16 while
 * performing the assigned accounting Wave A2 live-verify of the `bills.recurring` leaf. USMCA's
 * Recurring Bill Templates list showed "Vendor — not visible" for a real template whose vendor_uuid
 * genuinely resolved to a real, active mdata.vendors row.
 *
 * ROOT CAUSE: getTemplate() and listTemplates() in
 * apps/backend/src/accounting/bills/recurring/template.service.ts did `SELECT * FROM
 * accounting.recurring_bill_templates` with NO join to mdata.vendors at all — the API response never
 * carried a vendor_name field, so EVERY recurring bill template in EVERY entity showed
 * "Vendor — not visible" in the UI (RecurringBillList.tsx / RecurringBillDetail read `tmpl.vendor_name`),
 * even though vendor_uuid is a validated (`z.string().uuid()`) direct mdata.vendors.id FK. Live-measured:
 * 0 of 1 USMCA recurring bill template resolved a vendor name pre-fix; the same live SQL join confirmed
 * the vendor ("CC3 Battery Vendor 20260806-01") resolves cleanly.
 *
 * FIX: both getTemplate() and listTemplates() now LEFT JOIN mdata.vendors on v.id = t.vendor_uuid
 * (scoped to the same operating_company_id) and select v.vendor_name alongside the template row.
 *
 * Static check (always runs): both functions carry the vendor join and select vendor_name.
 *
 * Live check (opt-in): every active USMCA/TRANSP/TRK recurring bill template resolves a vendor name.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-recurring-bill-templates-vendor-name-resolves";
const TARGET_REL = "apps/backend/src/accounting/bills/recurring/template.service.ts";
const JOIN_PATTERN = "LEFT JOIN mdata.vendors v ON v.id = t.vendor_uuid";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against a mutated in-memory copy. */
export function assertVendorJoinPresent(source) {
  const errors = [];
  const joinCount = (source.match(new RegExp(JOIN_PATTERN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  // getTemplate + listTemplates = 2 sites.
  if (joinCount < 2) {
    errors.push(`only ${joinCount} of 2 expected mdata.vendors join sites found (getTemplate/listTemplates)`);
  }
  if (!/v\.vendor_name/.test(source)) {
    errors.push("no site selects v.vendor_name");
  }
  return errors;
}

function selftest() {
  const problems = [];
  const live = read(TARGET_REL);

  const liveErrors = assertVendorJoinPresent(live);
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    [
      "vendor join removed from both sites",
      live.replace(new RegExp(JOIN_PATTERN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "-- join removed"),
      "expected mdata.vendors join sites",
    ],
    [
      "vendor_name selection removed",
      live.replace(/v\.vendor_name/g, "'removed'"),
      "no site selects v.vendor_name",
    ],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated === live) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertVendorJoinPresent(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live source clean; ${cases.length} planted regressions caught`);
}

async function liveScan() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    const missing = !connectionString ? "DATABASE_URL is unset" : "ENABLE_LIVE_DB_UNIT_TEST_GUARD is not 'true'";
    console.log(`${LABEL} — static checks PASSED · SKIPPED-DB-CHECK (${missing}); the live scan did NOT run`);
    return;
  }

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    const results = await client.query(
      `
        SELECT set_config('app.bypass_rls', 'lucia', true);
        SELECT t.operating_company_id::text AS operating_company_id, count(*) AS unresolved
        FROM accounting.recurring_bill_templates t
        WHERE t.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM mdata.vendors v
            WHERE v.id = t.vendor_uuid AND v.operating_company_id = t.operating_company_id
          )
        GROUP BY t.operating_company_id
        HAVING count(*) > 0;
      `
    );
    const res = Array.isArray(results) ? results[results.length - 1] : results;

    if (res.rows.length > 0) {
      const rows = res.rows.map((row) => `${row.operating_company_id}: ${row.unresolved} unresolved`).join(", ");
      console.error(`${LABEL} FAILED\n- active recurring bill templates with an unresolvable vendor_uuid: ${rows}`);
      process.exit(1);
    }
  } finally {
    await client.end();
  }

  console.log(`${LABEL} — OK`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertVendorJoinPresent(read(TARGET_REL));
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }

  await liveScan();
}

main().catch((error) => {
  console.error(`${LABEL} FAILED\n- ${String(error?.message ?? error)}`);
  process.exit(1);
});
