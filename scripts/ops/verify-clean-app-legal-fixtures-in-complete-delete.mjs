#!/usr/bin/env node
/**
 * Clean-app legal fixtures must be roots in complete-delete --scope=usmca-clean
 * (owner 2026-10-02 clean-app law + Cursor OUTBOX leftover).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-clean-app-legal-fixtures-in-complete-delete";
const ENGINE = "scripts/ops/2026-10-02-cc1-r326-complete-delete.ts";

function main() {
  const src = fs.readFileSync(path.join(ROOT, ENGINE), "utf8");
  for (const needle of [
    '"legal.matters"',
    '"legal.contract_instances"',
    "pending clean-app delete",
    '"legal.matter_events"',
    "LEGAL_FIXTURE",
  ]) {
    if (!src.includes(needle)) throw new Error(`${ENGINE}: missing ${JSON.stringify(needle)}`);
  }
  if (!src.includes("usmca-clean")) throw new Error(`${ENGINE}: missing usmca-clean scope`);
  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
  } catch (err) {
    console.error(`${LABEL}: SELFTEST FAIL — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
