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
  let failed = 0;
  for (const c of cases) {
    const n = assertHandler(c.src, "test.ts").length;
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
