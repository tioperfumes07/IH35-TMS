#!/usr/bin/env node
/**
 * ROUND 443.10 (owner, 2026-10-10) — the bookLoad zero-dollar dispatch gate may open ONLY for the
 * owner-authorized $0 Transportation load, and only through the explicit authorizedZeroRevenue flag.
 *
 * Fails when, in apps/backend/src/dispatch/book-load.service.ts:
 *   1. the unflagged gate no longer throws E_LOAD_DISPATCHED_NO_CHARGE_LINES for a non-backfill source;
 *   2. the unflagged gate is not guarded by `authorizedZeroRevenue !== true` (any looser test — a
 *      truthy check, `== true`, a negation — would let a stray value open it);
 *   3. the authorized branch does not file the exception row (gate zero_dollar_charge_lines_at_dispatch,
 *      reason owner_authorized_zero_revenue) through appendCrudAudit;
 *   4. the flag on a rated load is not refused with zero_revenue_flag_on_rated_load;
 *   5. authorizedZeroRevenue is read any way other than `=== true` / `!== true`;
 * or when any dispatch/** source outside book-load.service.ts / loads.routes.ts mentions the flag (only
 * the route carries it into bookLoad; nothing in dispatch may set it). The same flag NAME is used by
 * CC-1's invoice + settlement-creator paths (accounting/, driver-finance/) -- out of this scope.
 *
 *   node scripts/verify-book-load-zero-dollar-gate-authorized-only.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/dispatch/book-load.service.ts";
const ROUTE = "apps/backend/src/dispatch/loads.routes.ts";
const DISPATCH_SRC = "apps/backend/src/dispatch";

export function checkService(src) {
  const errors = [];
  if (!/if \(source !== "historical_backfill"\) \{\s*throw new Error\(zeroChargeMessage\);/.test(src)) {
    errors.push("unflagged zero-dollar gate no longer throws E_LOAD_DISPATCHED_NO_CHARGE_LINES for a non-backfill source");
  }
  if (!src.includes("E_LOAD_DISPATCHED_NO_CHARGE_LINES:Load")) {
    errors.push("E_LOAD_DISPATCHED_NO_CHARGE_LINES message is gone");
  }
  if (!/if \(totalChargeCents === 0 && input\.authorizedZeroRevenue !== true\) \{/.test(src)) {
    errors.push("unflagged gate is not guarded by `totalChargeCents === 0 && input.authorizedZeroRevenue !== true`");
  }
  const authBranch = src.match(/if \(totalChargeCents === 0 && input\.authorizedZeroRevenue === true\) \{([\s\S]*?)\n      \}\n/);
  if (!authBranch) {
    errors.push("authorized $0 branch (`totalChargeCents === 0 && input.authorizedZeroRevenue === true`) is missing");
  } else {
    const body = authBranch[1];
    if (!body.includes("appendCrudAudit(")) errors.push("authorized $0 branch does not file an audit exception row");
    if (!body.includes('gate: "zero_dollar_charge_lines_at_dispatch"')) errors.push("authorized $0 exception row lacks gate zero_dollar_charge_lines_at_dispatch");
    if (!body.includes('reason: "owner_authorized_zero_revenue"')) errors.push("authorized $0 exception row lacks reason owner_authorized_zero_revenue");
    if (/throw |return /.test(body)) errors.push("authorized $0 branch must record and proceed, not throw/return");
  }
  if (!/input\.authorizedZeroRevenue === true && input\.charges\.reduce\([^\n]*\) !== 0\) \{\s*return \{ kind: "error", status: 422, payload: \{ error: "zero_revenue_flag_on_rated_load" \} \};/.test(src)) {
    errors.push("flag on a rated load is not refused with zero_revenue_flag_on_rated_load");
  }
  const reads = [...src.matchAll(/input\.authorizedZeroRevenue(?!\?:)(\s*[!=]==\s*true)?/g)];
  for (const r of reads) {
    if (!r[1]) errors.push(`authorizedZeroRevenue read loosely (not === true / !== true) at offset ${r.index}`);
  }
  return errors;
}

export function checkOtherFiles(files) {
  const allowed = new Set([SERVICE, ROUTE]);
  return files
    .filter(([rel, text]) => !allowed.has(rel) && !rel.includes("/__tests__/") && !/\.test\.ts$/.test(rel) && text.includes("authorizedZeroRevenue"))
    .map(([rel]) => `${rel} mentions authorizedZeroRevenue — in dispatch only the route may carry the flag into bookLoad`);
}

function listTs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listTs(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  const cases = [
    ["gate throw removed", good.replace("throw new Error(zeroChargeMessage);", "/* removed */")],
    ["unflagged guard loosened", good.replace("input.authorizedZeroRevenue !== true) {", "!input.authorizedZeroRevenue) {")],
    ["authorized branch skips audit", good.replace(/(authorizedZeroRevenue === true\) \{\s*)await appendCrudAudit\(/, "$1await noop(")],
    ["reason renamed", good.replace('reason: "owner_authorized_zero_revenue"', 'reason: "x"')],
    ["rated refusal removed", good.replace('"zero_revenue_flag_on_rated_load"', '"ok"')],
    ["truthy read planted", good.replace("const source = opts.source;", "const source = opts.source; if (input.authorizedZeroRevenue) void 0;")],
  ];
  let ok = checkService(good).length === 0;
  if (!ok) console.error("selftest: the real service must pass", checkService(good));
  for (const [name, planted] of cases) {
    if (planted === good) { console.error(`selftest: plant "${name}" did not apply`); ok = false; continue; }
    if (checkService(planted).length === 0) { console.error(`selftest: missed "${name}"`); ok = false; }
  }
  const stray = checkOtherFiles([["apps/backend/src/dispatch/x.ts", "authorizedZeroRevenue: true"], [ROUTE, "authorizedZeroRevenue"]]);
  if (stray.length !== 1) { console.error("selftest: stray-file check failed", stray); ok = false; }
  console.log(ok ? `verify-book-load-zero-dollar-gate-authorized-only --selftest PASS (${cases.length + 2} cases)` : "selftest FAIL");
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes("--selftest")) selftest();

const errors = checkService(fs.readFileSync(path.join(ROOT, SERVICE), "utf8"));
const files = listTs(path.join(ROOT, DISPATCH_SRC)).map((p) => [path.relative(ROOT, p).split(path.sep).join("/"), fs.readFileSync(p, "utf8")]);
errors.push(...checkOtherFiles(files));
if (!fs.readFileSync(path.join(ROOT, ROUTE), "utf8").includes("authorizedZeroRevenue: z.boolean().optional()")) {
  errors.push(`${ROUTE} does not accept authorizedZeroRevenue as an optional boolean`);
}
if (errors.length) {
  console.error("verify-book-load-zero-dollar-gate-authorized-only FAIL");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`verify-book-load-zero-dollar-gate-authorized-only PASS (${files.length} dispatch files scanned)`);
