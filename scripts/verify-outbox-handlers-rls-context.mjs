#!/usr/bin/env node
/**
 * LV-OUTBOX-HANDLER-SETS-WRONG-TENANT-GUC
 *
 * Outbox handlers run without a user session. RLS policies on mdata/accounting/
 * driver_finance/etc. consult either identity.is_lucia_bypass() (app.bypass_rls)
 * or the authenticated user identity, not app.operating_company_id alone.
 *
 * This guard asserts that every handler that issues a SELECT/INSERT/UPDATE/DELETE
 * against an RLS-protected schema sets one of the accepted session contexts
 * BEFORE its first such query.
 *
 * Run: node scripts/verify-outbox-handlers-rls-context.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-outbox-handlers-rls-context";
const HANDLERS_DIR = "apps/backend/src/outbox/handlers";

const RLS_SCHEMAS = ["mdata.", "accounting.", "driver_finance.", "banking.", "payroll.", "maintenance.", "safety.", "fuel.", "catalogs."];
const QUERY_RE = /\b(from|into|update|join)\s+([a-z_][a-z0-9_]*)\./gi;
const SETUP_RE = /set_config\s*\(\s*['"](app\.bypass_rls|app\.current_user_id|app\.user_id)['"]/;
const DRIVER_PROFILE_HANDLER = "driver-profile-message-delivery.handler.ts";

function hasRlsQuery(source) {
  for (const m of source.matchAll(QUERY_RE)) {
    const schema = m[2].toLowerCase();
    if (RLS_SCHEMAS.some((s) => s.startsWith(schema + "."))) return true;
  }
  return false;
}

function extractHandlerBody(source) {
  // Locate the deliver method and extract its balanced body.
  const startMatch = /async\s+deliver\s*\([^)]*\)\s*(?::\s*[A-Za-z0-9_<>,\s]+)?\s*\{/.exec(source);
  if (!startMatch) return source;
  let depth = 1;
  let i = startMatch.index + startMatch[0].length;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return source.slice(startMatch.index + startMatch[0].length, i - 1);
}

export function assertHandler(source, filename) {
  const errors = [];
  const body = extractHandlerBody(source);
  if (!hasRlsQuery(body)) return errors; // no RLS-protected query to guard

  // Find first RLS query occurrence.
  const firstQueryIdx = (() => {
    let idx = Infinity;
    for (const m of body.matchAll(QUERY_RE)) {
      const schema = m[2].toLowerCase();
      if (RLS_SCHEMAS.some((s) => s.startsWith(schema + "."))) {
        idx = Math.min(idx, m.index);
      }
    }
    return idx === Infinity ? -1 : idx;
  })();

  const beforeFirstQuery = body.slice(0, firstQueryIdx);
  if (!SETUP_RE.test(beforeFirstQuery)) {
    errors.push(
      `${filename}: delivers an RLS-protected query but does not establish app.bypass_rls, app.current_user_id, or app.user_id before the first query`
    );
  }

  if (filename === DRIVER_PROFILE_HANDLER) {
    if (!/set_config\s*\(\s*['"]app\.bypass_rls['"]\s*,\s*['"]lucia['"]\s*,\s*true\s*\)/.test(beforeFirstQuery)) {
      errors.push(`${filename}: must establish canonical lucia worker bypass before the delivery receipt update`);
    }
    if (!/UPDATE\s+mdata\.driver_profile_messages[\s\S]*?WHERE\s+id\s*=\s*\$1::uuid[\s\S]*?operating_company_id\s*=\s*\$2::uuid[\s\S]*?driver_id\s*=\s*\$4::uuid/i.test(body)) {
      errors.push(`${filename}: delivery receipt update must retain exact message, company, and driver predicates`);
    }
  }
  return errors;
}

function selftest() {
  const good = `
export class GoodHandler implements OutboxEventHandler {
  async deliver(payload, ctx) {
    const id = payload.id;
    await ctx.client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await ctx.client.query("SELECT id FROM mdata.customers WHERE id = $1", [id]);
  }
}
`;
  const goodUser = `
export class GoodUserHandler implements OutboxEventHandler {
  async deliver(payload, ctx) {
    const id = payload.id;
    await ctx.client.query("SELECT set_config('app.current_user_id', $1, true)", [payload.actor_user_id]);
    await ctx.client.query("SELECT id FROM mdata.customers WHERE id = $1", [id]);
  }
}
`;
  const bad = `
export class BadHandler implements OutboxEventHandler {
  async deliver(payload, ctx) {
    const id = payload.id;
    await ctx.client.query("SELECT set_config('app.operating_company_id', $1, true)", [payload.company_id]);
    await ctx.client.query("SELECT id FROM mdata.customers WHERE id = $1", [id]);
  }
}
`;
  const noQuery = `
export class NoQueryHandler implements OutboxEventHandler {
  async deliver(payload, ctx) {
    await ctx.client.query("SELECT set_config('app.operating_company_id', $1, true)", [payload.company_id]);
    return { ok: true };
  }
}
`;
  const cases = [
    { n: "bypass before query → 0", src: good, want: 0 },
    { n: "user id before query → 0", src: goodUser, want: 0 },
    { n: "only company id before query → 1", src: bad, min: 1 },
    { n: "no RLS query → 0", src: noQuery, want: 0 },
  ];
  const driverProfile = `
export class DriverProfileMessageDeliveryHandler {
  async deliver(payload, ctx) {
    await ctx.client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await ctx.client.query("UPDATE mdata.driver_profile_messages SET provider_message_id = $3 WHERE id = $1::uuid AND operating_company_id = $2::uuid AND driver_id = $4::uuid", [payload.id, payload.company_id, payload.provider_id, payload.driver_id]);
  }
}
`;
  cases.push(
    { n: "driver-profile exact worker receipt → 0", src: driverProfile, file: DRIVER_PROFILE_HANDLER, want: 0 },
    { n: "driver-profile missing canonical bypass → 1+", src: driverProfile.replace("SELECT set_config('app.bypass_rls', 'lucia', true)", "SELECT set_config('app.operating_company_id', $1, true)"), file: DRIVER_PROFILE_HANDLER, min: 1 },
    { n: "driver-profile missing driver predicate → 1+", src: driverProfile.replace(" AND driver_id = $4::uuid", ""), file: DRIVER_PROFILE_HANDLER, min: 1 },
  );
  let failed = 0;
  for (const c of cases) {
    const n = assertHandler(c.src, c.file ?? "test.ts").length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const handlersDir = path.join(ROOT, HANDLERS_DIR);
if (!fs.existsSync(handlersDir)) {
  console.error(`[${LABEL}] FAILED — handlers directory not found: ${HANDLERS_DIR}`);
  process.exit(1);
}

const files = fs.readdirSync(handlersDir).filter((f) => f.endsWith(".handler.ts"));
const errors = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(handlersDir, f), "utf8");
  errors.push(...assertHandler(src, f));
}

if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — all ${files.length} outbox handlers that touch RLS-protected tables establish a bypass or user context before querying.`);
