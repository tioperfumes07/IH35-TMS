#!/usr/bin/env node
/**
 * DISPATCH-BORDER-CROSSING-WAIT-TIMES-RLS-500
 *
 * reference.cbp_wait_times_cache's own INSERT policy (migration 0313) is
 * `WITH CHECK (identity.is_lucia_bypass())` — every write to this table has always required the
 * lucia RLS-bypass GUC. cacheCbpWaitTimes() used to INSERT on whatever plain client the caller
 * passed in (never bypass-scoped), so every write 42501'd for all 5 CBP port codes. This guard
 * locks the fix: the INSERT must run inside withLuciaBypass().
 */
import fs from "node:fs";

const SERVICE_REL = "apps/backend/src/border-crossing/cbp-wait-times.service.ts";

export function run(root = process.cwd()) {
  const failures = [];
  let src;
  try {
    src = fs.readFileSync(`${root}/${SERVICE_REL}`, "utf8");
  } catch {
    return [`${SERVICE_REL}: missing`];
  }

  if (!/import\s*\{[^}]*withLuciaBypass[^}]*\}\s*from\s*["']\.\.\/auth\/db\.js["']/.test(src)) {
    failures.push("must import withLuciaBypass from ../auth/db.js");
  }

  const fnIdx = src.indexOf("export async function cacheCbpWaitTimes(");
  if (fnIdx < 0) {
    failures.push("cacheCbpWaitTimes function not found");
    return failures;
  }
  const nextFnIdx = src.indexOf("\nexport async function", fnIdx + 1);
  const fnBody = src.slice(fnIdx, nextFnIdx > 0 ? nextFnIdx : undefined);

  if (!/withLuciaBypass\(/.test(fnBody)) {
    failures.push("cacheCbpWaitTimes must run its INSERT inside withLuciaBypass(...)");
  }
  const insertIdx = fnBody.indexOf("INSERT INTO reference.cbp_wait_times_cache");
  const bypassIdx = fnBody.indexOf("withLuciaBypass(");
  if (insertIdx >= 0 && bypassIdx >= 0 && insertIdx < bypassIdx) {
    failures.push("the INSERT must be textually INSIDE the withLuciaBypass(...) callback, not before it");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-cbp-wait-times-");
  const dir = `${tmp}/apps/backend/src/border-crossing`;
  fs.mkdirSync(dir, { recursive: true });

  const fixed = `
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { withLuciaBypass } from "../auth/db.js";

export async function cacheCbpWaitTimes(rows) {
  await withLuciaBypass(async (bypassClient) => {
    for (const row of rows) {
      await bypassClient.query(
        \`INSERT INTO reference.cbp_wait_times_cache (id, cbp_port_code, lane_type, wait_time_minutes, lanes_open, fetched_at) VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()))\`,
        [randomUUID(), row.cbp_port_code, row.lane_type, row.wait_time_minutes, row.lanes_open, row.fetched_at]
      );
    }
  });
}
export async function refreshAllActivePortWaitTimes(client) {}
`;
  fs.writeFileSync(`${dir}/cbp-wait-times.service.ts`, fixed);
  const passFailures = run(tmp);
  if (passFailures.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(passFailures));

  // Mutation 1: exact pre-fix pattern — plain client, no bypass at all.
  const broken1 = `
import { randomUUID } from "node:crypto";
import type pg from "pg";

export async function cacheCbpWaitTimes(client, rows) {
  for (const row of rows) {
    await client.query(
      \`INSERT INTO reference.cbp_wait_times_cache (id, cbp_port_code, lane_type, wait_time_minutes, lanes_open, fetched_at) VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()))\`,
      [randomUUID(), row.cbp_port_code, row.lane_type, row.wait_time_minutes, row.lanes_open, row.fetched_at]
    );
  }
}
export async function refreshAllActivePortWaitTimes(client) {}
`;
  fs.writeFileSync(`${dir}/cbp-wait-times.service.ts`, broken1);
  const f1 = run(tmp);
  if (f1.length === 0) throw new Error("FAIL to catch: unwrapped INSERT went undetected");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-cbp-wait-times-cache-lucia-bypass SELFTEST PASS");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-cbp-wait-times-cache-lucia-bypass FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-cbp-wait-times-cache-lucia-bypass OK — cache write runs under the lucia RLS bypass its own INSERT policy requires");
