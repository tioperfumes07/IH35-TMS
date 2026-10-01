#!/usr/bin/env node
/**
 * ORDERS 2026-10-01 rule 2 — GUARD. The Samsara master-sync cron writes business records
 * (mdata.drivers / mdata.units / mdata.equipment); it must stay opt-in (ENABLE_SAMSARA_MASTER_SYNC_CRON=true).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FILE = resolve(ROOT, "apps/backend/src/cron/samsara-master-sync.cron.ts");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(raw) {
  const src = stripComments(raw);
  const gate = src.indexOf('process.env.ENABLE_SAMSARA_MASTER_SYNC_CRON !== "true"');
  const sched = src.indexOf("cron.schedule(");
  return gate < 0 || sched < 0 || gate > sched ? ["the Samsara master-sync cron (business-record writer) is no longer opt-in."] : [];
}

function selftest() {
  const g = readFileSync(FILE, "utf8");
  return check(g).length === 0 && check(g.replace('!== "true"', '=== "false"')).length > 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-samsara-master-sync-flag-off selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(readFileSync(FILE, "utf8"));
  console.log(p.length ? `verify-samsara-master-sync-flag-off FAILED:\n  - ${p.join("\n  - ")}` : "verify-samsara-master-sync-flag-off: OK -- business-record writer is opt-in.");
  process.exit(p.length ? 1 : 0);
}
