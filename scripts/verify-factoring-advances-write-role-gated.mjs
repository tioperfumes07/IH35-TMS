#!/usr/bin/env node
/**
 * ACCT-F5578 regression guard — every write route in factoring-advances.routes.ts must require an
 * executor role, not just currentAuthUser's session-only check.
 *
 * accounting/factoring-advances.routes.ts's POST /:id/void already called
 * requireVoidCancelExecutor(reply, role) (Owner/Administrator/Accountant, Jorge-locked 2026-06-29),
 * but the file's other 5 write routes -- create, /:id/advance, /:id/reserve-held, /:id/release,
 * /:id/recourse-return -- did not. Any authenticated company member (currentAuthUser + the
 * role-agnostic withCompanyScope membership check) could create/advance/hold/release/recourse a
 * factoring advance -- real cash-movement and reserve-liability operations -- the same
 * authorization-gap class as ACCT-F5576/F5577.
 *
 * Fix: reuse the file's own already-imported requireVoidCancelExecutor on all 5 previously-unguarded
 * write routes, matching the precedent the void route already established in this same file.
 *
 * This static check (no DB connection) asserts requireVoidCancelExecutor is called exactly once per
 * write route (6 total: create, advance, reserve-held, release, recourse-return, void).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:factoring-advances-write-role-gated";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/accounting/factoring-advances.routes.ts";

const WRITE_ROUTES = [
  ['app.post("/api/v1/accounting/factoring-advances", ', "POST /factoring-advances (create)"],
  ['app.post("/api/v1/accounting/factoring-advances/:id/advance", ', "POST /:id/advance"],
  ['app.post("/api/v1/accounting/factoring-advances/:id/reserve-held", ', "POST /:id/reserve-held"],
  ['app.post("/api/v1/accounting/factoring-advances/:id/release", ', "POST /:id/release"],
  ['app.post("/api/v1/accounting/factoring-advances/:id/recourse-return", ', "POST /:id/recourse-return"],
  ['app.post("/api/v1/accounting/factoring-advances/:id/void", ', "POST /:id/void"],
];

function assertAll(src) {
  const problems = [];
  for (const [needle, label] of WRITE_ROUTES) {
    const idx = src.indexOf(needle);
    if (idx === -1) {
      problems.push(`${label}: route not found (guard target moved; update this guard)`);
      continue;
    }
    // Look at the next ~800 chars of the handler body for the role-gate call (long enough to span
    // the create route's multi-line ACCT-F5578 comment block).
    const window = src.slice(idx, idx + 800);
    if (!/requireVoidCancelExecutor\(reply, String\(user\.role \?\? ""\)\)/.test(window)) {
      problems.push(`${label}: missing requireVoidCancelExecutor role gate`);
    }
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  // Plant defect: drop the role gate from the create route specifically (leave the others intact,
  // proving the guard checks each route independently rather than a single file-wide grep count).
  const planted = src.replace(
    'app.post("/api/v1/accounting/factoring-advances", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {\n    const user = currentAuthUser(req, reply);\n    if (!user) return;\n    // ACCT-F5578: this route (and 4 siblings below) had no role gate -- currentAuthUser only requires\n    // a session. Reusing the file\'s own void/cancel executor role set (Owner/Administrator/Accountant,\n    // Jorge-locked 2026-06-29) since creating/advancing/holding/releasing a factoring advance is the\n    // same tier of financial-executor operation as this file\'s own already-gated void route.\n    if (!requireVoidCancelExecutor(reply, String(user.role ?? ""))) return;\n',
    'app.post("/api/v1/accounting/factoring-advances", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {\n    const user = currentAuthUser(req, reply);\n    if (!user) return;\n',
  );
  if (planted === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation target not found (guard text drifted from real code)`);
    process.exit(1);
  }
  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect (create route role gate dropped) not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
