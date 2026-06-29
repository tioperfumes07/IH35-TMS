#!/usr/bin/env node
/**
 * STEP-0 orphan check for the factoring-FK reconciliation (Tier-1, build-and-hold).
 *
 * GUARD verified PROD DRIFT: accounting.invoices has column `factoring_advance_id` but is MISSING the
 * FK `fk_invoices_factoring_advance → accounting.factoring_advances(id)` (0061 declares it; CI fresh-
 * migrate has it; prod does not). The reconciliation migration re-adds the FK — but `ADD CONSTRAINT`
 * FAILS if any invoice points at a non-existent advance. This script finds those orphans FIRST.
 *
 * READ-ONLY. Requires an EXPLICIT --database-url (never auto-connects via .env — §1.5). Jorge/GUARD
 * run it against prod intentionally; the migration is applied only after this returns zero orphans.
 *
 *   node scripts/check-orphan-factoring-advance-ids.mjs --database-url="postgres://…"
 *
 * Exit 0 = zero orphans (safe to apply the FK). Exit 2 = orphans found (do NOT apply; Jorge decides
 * how to reconcile the data first). Exit 1 = usage/connection error.
 */
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

function arg(name) {
  const pre = `--${name}=`;
  const eq = process.argv.find((a) => a.startsWith(pre));
  if (eq) return eq.slice(pre.length);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const url = arg("database-url");
if (!url) {
  console.error(
    "usage: check-orphan-factoring-advance-ids --database-url=<url>\n" +
      "Refusing to run without an explicit url (no .env auto-connect, §1.5)."
  );
  process.exit(1);
}

const SQL = `
  -- read-only: invoices whose factoring_advance_id has no matching advance
  SELECT i.id::text AS invoice_id, i.factoring_advance_id::text AS factoring_advance_id
  FROM accounting.invoices i
  WHERE i.factoring_advance_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM accounting.factoring_advances fa WHERE fa.id = i.factoring_advance_id
    )
  ORDER BY i.id
`;

const client = new Client(buildPgClientConfig(url));
try {
  await client.connect();
  const db = await client.query("SELECT current_database() AS db, COALESCE(host(inet_server_addr())::text,'local-socket') AS host");
  console.log(`[orphan-check] connected: db=${db.rows[0].db} host=${db.rows[0].host}`);
  const res = await client.query(SQL);
  if (res.rows.length === 0) {
    console.log("[orphan-check] OK — 0 orphaned invoices.factoring_advance_id. Safe to apply fk_invoices_factoring_advance.");
    process.exit(0);
  }
  console.error(`[orphan-check] FOUND ${res.rows.length} orphaned invoice(s) — FK add WILL fail. Do NOT apply until reconciled:`);
  for (const r of res.rows.slice(0, 50)) console.error(`  invoice ${r.invoice_id} → missing advance ${r.factoring_advance_id}`);
  if (res.rows.length > 50) console.error(`  … and ${res.rows.length - 50} more`);
  process.exit(2);
} catch (err) {
  console.error(`[orphan-check] ERROR: ${String(err?.message ?? err)}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
