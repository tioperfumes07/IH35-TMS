#!/usr/bin/env node
/**
 * Lead 2026-10-03 (owner ordered repaired). FAILS IF a guard can read the database as ih35_app.
 * The app pool's session-level SET ROLE ih35_app (apps/backend/src/auth/db.ts:55, :80) survives on Neon's
 * pgbouncer backends, so a guard on the pooled URL can land as ih35_app and read a MASKED 0 (measured:
 * dispatch.load_charge_lines 0 rows pooled, 284 / 136 company-less direct). The rule lives in the harness:
 * scripts/lib/guard-db-url.mjs moves every guard database URL to the DIRECT endpoint.
 *   static — the three entry points (money-pr-local-gate runNode, run-required-guards, require-live-db) apply it;
 *            the rewrite turns a pooled host direct and leaves everything else byte-identical.
 *   live   — the URL a guard is handed is not pooled, and 5 fresh guard connections all read as a role
 *            other than ih35_app. --probe-pooled also reports what the pooled endpoint returns (evidence only).
 * No allow-list. No database = FAIL. Run: node scripts/verify-guards-do-not-run-as-ih35_app.mjs [--selftest|--probe-pooled]
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { directGuardUrl, guardDbEnv, isPooledHost, FORBIDDEN_GUARD_ROLE } from "./lib/guard-db-url.mjs";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";
import { resolveGateReadonlyDbUrl } from "./lib/gate-db-credential.mjs";

const LABEL = "verify-guards-do-not-run-as-ih35_app";
const require = createRequire(import.meta.url);

const ENTRY_POINTS = {
  "scripts/money-pr-local-gate.mjs": [/import \{ guardDbEnv \} from "\.\/lib\/guard-db-url\.mjs"/, /env: guardDbEnv\(env\)/],
  "scripts/lib/run-required-guards.mjs": [/import \{ guardDbEnv \} from '\.\/guard-db-url\.mjs'/, /env: guardDbEnv\(process\.env\)/],
  // ROUND 370 (Lead) added a fallback to the gate's read-only credential inside the same call — still direct.
  "scripts/lib/require-live-db.mjs": [/directGuardUrl\(\s*process\.env\.DATABASE_DIRECT_URL \|\| process\.env\.DATABASE_URL(?:\s*\|\|\s*resolveGateReadonlyDbUrl\(\))?\s*\)/, /=== FORBIDDEN_GUARD_ROLE/],
};

export function entryPointGaps(read = (f) => readFileSync(f, "utf8")) {
  const f = [];
  for (const [file, res] of Object.entries(ENTRY_POINTS)) {
    let src;
    try { src = read(file); } catch { f.push(`${file}: missing`); continue; }
    for (const re of res) if (!re.test(src)) f.push(`${file}: no longer applies the direct-endpoint rule (${re.source})`);
  }
  return f;
}

const host = (u) => { try { return new URL(u.replace(/^postgres(ql)?:/i, "http:")).hostname; } catch { return ""; } };

export function rewriteGaps() {
  const P = "postgresql://u:p%40ss@ep-broad-block-akykk7bw-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require";
  const D = "postgresql://u:p%40ss@ep-broad-block-akykk7bw.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require";
  const cases = [
    ["pooled -> direct", directGuardUrl(P) === D],
    ["direct unchanged", directGuardUrl(D) === D],
    ["localhost unchanged", directGuardUrl("postgres://verify:verify@localhost:54329/ih35_verify") === "postgres://verify:verify@localhost:54329/ih35_verify"],
    ["no credentials", directGuardUrl("postgres://ep-a-b-pooler.x.neon.tech/db") === "postgres://ep-a-b.x.neon.tech/db"],
    ["pooler only in the database name is not a host", directGuardUrl("postgres://h.example.com/ep-x-pooler.db") === "postgres://h.example.com/ep-x-pooler.db"],
    ["env: all three keys", (() => { const e = guardDbEnv({ DATABASE_URL: P, DATABASE_DIRECT_URL: P, DATABASE_URL_READONLY: P, OTHER: P });
      return e.DATABASE_URL === D && e.DATABASE_DIRECT_URL === D && e.DATABASE_URL_READONLY === D && e.OTHER === P; })()],
    ["isPooledHost", isPooledHost(host(P)) && !isPooledHost(host(D))],
  ];
  return cases.filter(([, ok]) => !ok).map(([n]) => `rewrite: ${n}`);
}

export function roleGaps(roles) {
  return roles.flatMap((r, i) => (r === FORBIDDEN_GUARD_ROLE ? [`guard connection ${i + 1} read as ${FORBIDDEN_GUARD_ROLE}`] : []));
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["entry points real", entryPointGaps().length === 0],
    ["entry point stripped", entryPointGaps((f) => readFileSync(f, "utf8").replace(/guardDbEnv\(/g, "x(")).length === 2],
    ["rewrite", rewriteGaps().length === 0],
    ["roles clean", roleGaps(["neondb_owner", "ih35_ci_readonly"]).length === 0],
    ["roles leaked", roleGaps(["neondb_owner", "ih35_app"]).length === 1],
  ];
  const bad = cases.filter(([, v]) => !v);
  if (bad.length) { console.error(`selftest FAIL: ${bad.map(([n]) => n).join(", ")}`); process.exit(1); }
  console.log(`${LABEL} selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const fails = [...entryPointGaps(), ...rewriteGaps()];
// ROUND 384.1 + ROUND 386 (Lead) — resolve through the sanctioned gate credential (not env alone),
// and refuse to connect when nothing resolves. An unset connection string makes pg dial localhost:5432.
const raw = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL || resolveGateReadonlyDbUrl();
if (!raw) {
  console.error(
    `FAIL ${LABEL}: no guard database credential resolved (DATABASE_DIRECT_URL, DATABASE_URL, ` +
      `DATABASE_URL_READONLY, gate read-only credential). Refusing to connect — an unset ` +
      `connection string makes pg dial localhost:5432, which would verify a local database and ` +
      `report it as production.`
  );
  process.exit(1);
}
const handed = directGuardUrl(raw);
if (raw && isPooledHost(host(handed))) fails.push(`the URL a guard is handed is still the pooler (${host(handed)})`);

// requireLiveDbOrExit applies the rule and refuses ih35_app itself; probe 5 separate connections the same way.
const pgMod = await import("pg");
const pg = pgMod.default ?? pgMod;
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { client: c0, pool: p0 } = await requireLiveDbOrExit({ label: LABEL });
c0.release();
await p0.end();
const roles = [];
for (let i = 0; i < 5; i++) {
  const c = new pg.Client(buildPgClientConfig(handed));
  await c.connect();
  try { roles.push((await c.query("SELECT current_user AS u")).rows[0].u); } finally { await c.end(); }
}
fails.push(...roleGaps(roles));
console.log(`${LABEL}: guard endpoint ${isPooledHost(host(handed)) ? "POOLED" : "direct"}; 5 connections read as ${[...new Set(roles)].join(", ")}`);

if (process.argv.includes("--probe-pooled") && raw) {
  const pooled = handed.replace(/^(postgres(?:ql)?:\/\/(?:[^@/]*@)?)(ep-[a-z0-9-]+?)(\.)/i, "$1$2-pooler$3");
  const seen = [];
  for (let i = 0; i < 10; i++) {
    const c = new pg.Client(buildPgClientConfig(pooled));
    await c.connect();
    try { seen.push((await c.query("SELECT current_user AS u")).rows[0].u); } finally { await c.end(); }
  }
  console.log(`${LABEL}: EVIDENCE ONLY — pooled endpoint, 10 connections read as: ${seen.join(", ")}`);
}

if (fails.length) { for (const x of fails) console.error(`FAIL ${x}`); process.exit(1); }
console.log(`${LABEL}: PASS`);
