#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["invoices","from_load"],"leaves":["accounting.invoices.source_load_active_unique"],"task":"DSP-MONEY-F7175-LOAD-INVOICE-LOOKUP-FAILURE-CAN-CREATE-DUPLICATE","vertical":"column-wave"} */
/**
 * DSP-MONEY-F7175-LOAD-INVOICE-LOOKUP-FAILURE-CAN-CREATE-DUPLICATE (backend half, GO-0031, CC-1,
 * 2026-08-28): accounting.invoices.source_load_id had no DB-level uniqueness. from-load.ts's
 * buildInvoiceFromLoad does a plain SELECT-for-existing then INSERT with no row lock — a TOCTOU
 * race where two concurrent calls on the same never-before-invoiced load could both insert,
 * producing two live invoices. Separately, factoring/packet-assemble.service.ts's own from-load
 * auto-create already assumed a unique constraint existed (its INSERT used
 * `ON CONFLICT (source_load_id) DO NOTHING`) — with no matching index, that raised a guaranteed
 * 42P10 the moment the auto-factoring-packet branch ever tried to insert a new row, silently
 * caught one level up by pod.routes.ts's fire-and-forget `.catch((err) => req.log.warn(...))`.
 * Rehearsing the fix on a disposable Neon branch also surfaced a SECOND, independent bug in the
 * same INSERT: it never populated `display_id` (NOT NULL, no default, no trigger) — that INSERT
 * could never succeed at all, race or not. Both are fixed together here.
 *
 * This guard asserts, against the REAL files:
 *   1. Migration 202613270100 adds the partial unique index (source_load_id, WHERE voided_at IS NULL).
 *   2. from-load.ts's INSERT is wrapped in try/catch, recognizes the exact constraint name on 23505,
 *      and recurses into buildInvoiceFromLoad to hit the idempotent existing-invoice path.
 *   3. packet-assemble.service.ts's INSERT populates display_id (from l.load_number) and its
 *      ON CONFLICT clause carries the exact predicate matching the migration's partial index.
 *
 * Self-test: node scripts/verify-invoice-source-load-uniqueness-race.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-invoice-source-load-uniqueness-race";
const MIGRATION_FILE = "db/migrations/202613270100_dsp_money_f7175_uq_invoices_source_load_active.sql";
const FROM_LOAD_FILE = "apps/backend/src/accounting/from-load.ts";
const PACKET_FILE = "apps/backend/src/factoring/packet-assemble.service.ts";

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check(sources) {
  const failures = [];
  const get = (key, file) => (sources ? sources[key] : (() => { try { return readReal(file); } catch { return null; } })());
  const migrationSrc = get("migration", MIGRATION_FILE);
  const fromLoadSrc = get("fromLoad", FROM_LOAD_FILE);
  const packetSrc = get("packet", PACKET_FILE);

  if (migrationSrc == null) {
    failures.push(`${MIGRATION_FILE} not found`);
  } else if (!/CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_source_load_active[\s\S]*?ON accounting\.invoices \(source_load_id\)[\s\S]*?WHERE voided_at IS NULL AND source_load_id IS NOT NULL/.test(migrationSrc)) {
    failures.push(`${MIGRATION_FILE}: partial unique index uq_invoices_source_load_active not found with the expected shape`);
  }

  if (fromLoadSrc == null) {
    failures.push(`${FROM_LOAD_FILE} not found`);
  } else {
    if (!/} catch \(err\) \{[\s\S]*?pgErr\?\.code === "23505" && pgErr\?\.constraint === "uq_invoices_source_load_active"[\s\S]*?return buildInvoiceFromLoad\(client, input\);/.test(fromLoadSrc)) {
      failures.push(`${FROM_LOAD_FILE}: buildInvoiceFromLoad's INSERT must catch the 23505 on uq_invoices_source_load_active and recurse into the idempotent existing-invoice path`);
    }
    if (!/throw err;/.test(fromLoadSrc)) {
      failures.push(`${FROM_LOAD_FILE}: any other error must still propagate (not silently swallowed)`);
    }
  }

  if (packetSrc == null) {
    failures.push(`${PACKET_FILE} not found`);
  } else {
    const insertMatch = packetSrc.match(/INSERT INTO accounting\.invoices \([\s\S]*?ON CONFLICT[^\n]*\n/);
    if (!insertMatch) {
      failures.push(`${PACKET_FILE}: auto-create INSERT into accounting.invoices not found`);
    } else {
      const body = insertMatch[0];
      if (!/display_id,/.test(body)) {
        failures.push(`${PACKET_FILE}: INSERT must populate display_id — it is NOT NULL with no default/trigger, this INSERT cannot succeed without it`);
      }
      if (!/l\.load_number,/.test(body)) {
        failures.push(`${PACKET_FILE}: display_id must be sourced from l.load_number, matching from-load.ts's own INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER convention`);
      }
      if (!/ON CONFLICT \(source_load_id\) WHERE voided_at IS NULL AND source_load_id IS NOT NULL DO NOTHING/.test(body)) {
        failures.push(`${PACKET_FILE}: ON CONFLICT clause must carry the exact predicate matching the migration's partial index, or Postgres reports no matching arbiter`);
      }
    }
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const goodMigration = `
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_source_load_active
  ON accounting.invoices (source_load_id)
  WHERE voided_at IS NULL AND source_load_id IS NOT NULL;
COMMIT;
`;
  const goodFromLoad = `
  } catch (err) {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === "23505" && pgErr?.constraint === "uq_invoices_source_load_active") {
      return buildInvoiceFromLoad(client, input);
    }
    throw err;
  }
`;
  const goodPacket = `
          INSERT INTO accounting.invoices (
            operating_company_id,
            customer_id,
            source_load_id,
            display_id,
            status
          )
          SELECT
            l.operating_company_id,
            l.customer_id,
            l.id,
            l.load_number,
            'draft'
          FROM mdata.loads l
          ON CONFLICT (source_load_id) WHERE voided_at IS NULL AND source_load_id IS NOT NULL DO NOTHING
`;
  const good = { migration: goodMigration, fromLoad: goodFromLoad, packet: goodPacket };
  if (check(good).length !== 0) {
    console.error(`${LABEL} --selftest FAIL: fully-fixed shape produced failures:`, check(good));
    process.exit(1);
  }

  const noIndex = { ...good, migration: goodMigration.replace("WHERE voided_at IS NULL AND source_load_id IS NOT NULL", "") };
  if (check(noIndex).length === 0) {
    console.error(`${LABEL} --selftest FAIL: missing partial-index predicate escaped`);
    process.exit(1);
  }

  const noCatch = { ...good, fromLoad: goodFromLoad.replace(/} catch \(err\) \{[\s\S]*?throw err;\n  }\n/, "") };
  if (noCatch.fromLoad === good.fromLoad) {
    console.error(`${LABEL} --selftest FAIL: catch-removal pattern did not match, re-anchor`);
    process.exit(1);
  }
  if (check(noCatch).length === 0) {
    console.error(`${LABEL} --selftest FAIL: missing race-catch escaped`);
    process.exit(1);
  }

  const noDisplayId = { ...good, packet: goodPacket.replace("            display_id,\n", "").replace("            l.load_number,\n", "") };
  if (check(noDisplayId).length === 0) {
    console.error(`${LABEL} --selftest FAIL: missing display_id in packet-assemble INSERT escaped`);
    process.exit(1);
  }

  const wrongConflict = { ...good, packet: goodPacket.replace("ON CONFLICT (source_load_id) WHERE voided_at IS NULL AND source_load_id IS NOT NULL DO NOTHING", "ON CONFLICT (source_load_id) DO NOTHING") };
  if (check(wrongConflict).length === 0) {
    console.error(`${LABEL} --selftest FAIL: mismatched ON CONFLICT predicate escaped`);
    process.exit(1);
  }

  if (check().length !== 0) {
    console.error(`${LABEL} --selftest FAIL: real repo files do not currently satisfy this guard:`, check());
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (5 checks)`);
  process.exit(0);
}

const failures = check();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`${LABEL} PASS — accounting.invoices.source_load_id race is closed at the DB level and both writers agree on the arbiter`);
