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

const src = fs.readFileSync(FILE, "utf8");

// Extract the value of RELAY_INGEST_OVERLAP_DAYS
const match = src.match(/export\s+const\s+RELAY_INGEST_OVERLAP_DAYS\s*=\s*(\d+)/);
if (!match) {
  console.error(`[${LABEL}] FAIL — RELAY_INGEST_OVERLAP_DAYS not found in relay-fuel-ingest-window.ts`);
  process.exit(1);
}

const value = parseInt(match[1], 10);
if (value < 7) {
  console.error(
    `[${LABEL}] FAIL — RELAY_INGEST_OVERLAP_DAYS is ${value}; must be >= 7. ` +
    `Prod data shows Relay posts fills up to 39 days in arrears; 184 rows had lag > 3 days. ` +
    `See 443.201 evidence in docs/bus/SEATS-TO-LEAD.md.`
  );
  process.exit(1);
}

console.log(`[${LABEL}] OK — RELAY_INGEST_OVERLAP_DAYS = ${value} (>= 7)`);
