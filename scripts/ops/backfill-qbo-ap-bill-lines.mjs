#!/usr/bin/env node
/**
 * Owner-run ONLY — project QBO Bill Line[] from mdata.qbo_ap_bills.payload_json into
 * accounting.bill_lines for entities that already have QBO-sourced bill headers.
 *
 * Does NOT invent lines from header totals. Does NOT post GL. Does NOT write to QBO.
 * Agent must not execute this against prod — Jorge runs after merge/deploy.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/ops/backfill-qbo-ap-bill-lines.mjs
 *   DATABASE_URL=... npx tsx scripts/ops/backfill-qbo-ap-bill-lines.mjs --company <uuid>
 *
 * Requires QBO_AP_BILLS_PROJECTION_ENABLED ON for each entity (or pass --force to skip the
 * flag check — still entity-scoped, still no GL). Prefer leaving the flag ON and omitting --force.
 */
import pg from "pg";
import dotenv from "dotenv";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("../lib/pg-connection-options.cjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const forceIdx = args.indexOf("--force");
const force = forceIdx >= 0;
if (force) args.splice(forceIdx, 1);
const companyIdx = args.indexOf("--company");
const companyArg = companyIdx >= 0 ? args[companyIdx + 1] : null;

async function listCompanies(client) {
  if (companyArg) return [companyArg];
  const res = await client.query(`SELECT id::text AS id, code FROM org.companies ORDER BY code`);
  return res.rows.map((r) => r.id);
}

async function main() {
  const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!cs) {
    console.error("DATABASE_URL (or DATABASE_DIRECT_URL) required");
    process.exit(1);
  }

  // Dynamic import of the TypeScript projector (tsx resolves .ts).
  const pullerUrl = pathToFileURL(
    path.join(ROOT, "apps/backend/src/qbo-sync/ap-bills-puller.ts")
  ).href;
  const { projectApBillLinesToLedger, projectApBillsToLedger } = await import(pullerUrl);

  const client = new pg.Client(buildPgClientConfig(cs));
  await client.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const companies = await listCompanies(client);
    console.log(
      JSON.stringify({
        mode: force ? "force_lines_only" : "project_headers_then_lines",
        companies: companies.length,
        note: "Owner-run backfill — no GL posting",
      })
    );

    for (const companyId of companies) {
      let result;
      if (force) {
        result = { lines: await projectApBillLinesToLedger(companyId, { skipFlagCheck: true }) };
      } else {
        result = await projectApBillsToLedger(companyId);
      }
      console.log(
        JSON.stringify({
          operating_company_id: companyId,
          enabled: result.enabled ?? result.lines?.enabled,
          rows_projected: result.rowsProjected ?? null,
          lines_projected: result.lines?.linesProjected ?? result.linesProjected,
          lines_unmapped_account: result.lines?.linesUnmappedAccount ?? result.linesUnmappedAccount,
          lines_unmapped_item: result.lines?.linesUnmappedItem ?? result.linesUnmappedItem,
          header_line_sum_mismatch: result.lines?.headerLineSumMismatch ?? result.headerLineSumMismatch,
        })
      );
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
