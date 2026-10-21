#!/usr/bin/env node
/**
 * verify-relay-ingest-lookback.mjs — verify-step 18597 (CC-1 443.201)
 *
 * Prod data 2026-10-21 (USMCA): 184 relay_fuel_transactions have ingest lag > 3 days
 * (relay_created_at vs created_at), max 39 days. With RELAY_INGEST_OVERLAP_DAYS = 3,
 * any fill Relay publishes with relay_created_at more than 3 days before "yesterday"
 * is permanently missed under normal daily ticks.
 *
 * This guard asserts that RELAY_INGEST_OVERLAP_DAYS >= 7 in relay-fuel-ingest-window.ts.
 * Reverts to 3 fail immediately.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-ingest-lookback";
const FILE = path.join(
  ROOT,
  "apps/backend/src/integrations/relay-payments/relay-fuel-ingest-window.ts"
);

function check(src) {
  const match = src.match(/export\s+const\s+RELAY_INGEST_OVERLAP_DAYS\s*=\s*(\d+)/);
  if (!match) return [`RELAY_INGEST_OVERLAP_DAYS not found in relay-fuel-ingest-window.ts`];
  const value = parseInt(match[1], 10);
  if (value < 7) return [`RELAY_INGEST_OVERLAP_DAYS is ${value}; must be >= 7 (184 prod rows had lag > 3 days, max 39 days)`];
  return [];
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const realSrc = fs.readFileSync(FILE, "utf8");
  const own = check(realSrc);

  if (process.argv.includes("--selftest")) {
    if (own.length) {
      console.error(`[${LABEL}] --selftest FAIL on the real tree — ${own.join("; ")}`);
      process.exit(1);
    }
    const mutations = [
      ["overlap reverted to 3", realSrc.replace(/RELAY_INGEST_OVERLAP_DAYS\s*=\s*7/, "RELAY_INGEST_OVERLAP_DAYS = 3")],
      ["overlap set to 6 (below threshold)", realSrc.replace(/RELAY_INGEST_OVERLAP_DAYS\s*=\s*7/, "RELAY_INGEST_OVERLAP_DAYS = 6")],
      ["constant removed", realSrc.replace(/export\s+const\s+RELAY_INGEST_OVERLAP_DAYS\s*=\s*\d+;/, "")],
    ];
    let caught = 0;
    for (const [name, mutated] of mutations) {
      if (check(mutated).length === 0) {
        console.error(`[${LABEL}] --selftest FAIL — mutation "${name}" not caught`);
        process.exit(1);
      }
      caught++;
    }
    console.log(`[${LABEL}] --selftest PASS (${caught}/${mutations.length} mutations caught)`);
    process.exit(0);
  }

  if (own.length) {
    console.error(`[${LABEL}] FAIL — ${own.join("; ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — RELAY_INGEST_OVERLAP_DAYS = ${realSrc.match(/RELAY_INGEST_OVERLAP_DAYS\s*=\s*(\d+)/)[1]} (>= 7)`);
}
