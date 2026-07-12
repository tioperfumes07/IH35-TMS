#!/usr/bin/env node
/**
 * GL/Void flag-gate guard — MONEY_CONTROL_PERIOD_CLOSE_ENABLED / MONEY_CONTROL_PERIOD_REOPEN_ENABLED (AF-7).
 *
 * The accounting.periods CLOSE and REOPEN actions must be OFF by default and enable-able ONLY per entity
 * (an explicit tenant override) — the owner turns them on entity-by-entity (verify-then-flip). These gate
 * the close/reopen ACTIONS themselves; they are independent of the DB trigger (0183) that already blocks
 * POSTING INTO a closed period.
 *
 * Locks the gate so it can't regress:
 *   (1) FLAG KEYS: p7-wave2.routes.ts defines MONEY_CONTROL_PERIOD_CLOSE_FLAG_KEY /
 *       MONEY_CONTROL_PERIOD_REOPEN_FLAG_KEY with the exact AF-7 flag-key strings.
 *   (2) GATE BEFORE MUTATION: the close route resolves isEnabled(client, CLOSE_KEY, …) and throws
 *       'period_close_disabled' BEFORE `client.query("BEGIN")` (so no retained-earnings JE / period write
 *       on an OFF entity); the reopen route resolves isEnabled(client, REOPEN_KEY, …) and throws
 *       'period_reopen_disabled' BEFORE its `UPDATE accounting.periods … status = 'open'`.
 *   (3) ROUTE MAPS 409: both policy errors map to reply.code(409).
 *   (4) PER-ENTITY-ONLY: both keys are in PER_ENTITY_ONLY_FLAG_KEYS.
 *   (5) DEFAULT OFF: the AF-7 seed migration (202607110320) registers both with default_enabled=false.
 *
 * --selftest exercises pass + each failure mode.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-period-money-control-flag-gate";
const ROUTES = "apps/backend/src/accounting/p7-wave2.routes.ts";
const FLAG_SERVICE = "apps/backend/src/lib/feature-flags/service.ts";
const MIGRATION = "db/migrations/202607110320_af7_money_control_flags.sql";
const CLOSE_KEY = "MONEY_CONTROL_PERIOD_CLOSE_ENABLED";
const REOPEN_KEY = "MONEY_CONTROL_PERIOD_REOPEN_ENABLED";

const stripSql = (src) => src.replace(/--.*$/gm, "");

// Is `key` seeded with default_enabled = false? Find the FIRST `, <bool>, <rollout_pct>` pair after the
// key — that IS this tuple's (default_enabled, rollout_pct). Prose descriptions never contain a
// `, false, <digit>` / `, true, <digit>` shape, so this pins the right column without a fragile window.
function seededDefaultOff(mig, key) {
  const ki = Math.max(mig.indexOf(`'${key}'`), mig.indexOf(`"${key}"`));
  if (ki < 0) return false;
  const m = /,\s*(false|true)\s*,\s*\d/.exec(mig.slice(ki));
  return m ? m[1] === "false" : false;
}

export function assertGate({ routes, flagService, migration }) {
  const errors = [];

  // (1) flag-key consts
  if (!new RegExp(`MONEY_CONTROL_PERIOD_CLOSE_FLAG_KEY\\s*=\\s*["']${CLOSE_KEY}["']`).test(routes))
    errors.push(`${ROUTES}: MONEY_CONTROL_PERIOD_CLOSE_FLAG_KEY const ('${CLOSE_KEY}') missing`);
  if (!new RegExp(`MONEY_CONTROL_PERIOD_REOPEN_FLAG_KEY\\s*=\\s*["']${REOPEN_KEY}["']`).test(routes))
    errors.push(`${ROUTES}: MONEY_CONTROL_PERIOD_REOPEN_FLAG_KEY const ('${REOPEN_KEY}') missing`);

  // (2) CLOSE: gate resolved + thrown before BEGIN
  const closeGate = routes.search(/isEnabled\(\s*client\s*,\s*MONEY_CONTROL_PERIOD_CLOSE_FLAG_KEY/);
  const closeThrow = routes.search(/throw new Error\(\s*["']period_close_disabled["']\s*\)/);
  const beginIdx = routes.search(/client\.query\(\s*["']BEGIN["']\s*\)/);
  if (closeGate < 0) errors.push(`${ROUTES}: close route does not resolve isEnabled(client, MONEY_CONTROL_PERIOD_CLOSE_FLAG_KEY, …)`);
  if (closeThrow < 0) errors.push(`${ROUTES}: close route does not throw 'period_close_disabled' when OFF`);
  if (beginIdx < 0) errors.push(`${ROUTES}: could not locate the close BEGIN (guard anchor)`);
  if (closeGate >= 0 && beginIdx >= 0 && closeGate > beginIdx)
    errors.push(`${ROUTES}: period-close gate must run BEFORE BEGIN (no retained-earnings JE / period write on an OFF entity)`);

  // (2) REOPEN: gate resolved + thrown before the status='open' update
  const reopenGate = routes.search(/isEnabled\(\s*client\s*,\s*MONEY_CONTROL_PERIOD_REOPEN_FLAG_KEY/);
  const reopenThrow = routes.search(/throw new Error\(\s*["']period_reopen_disabled["']\s*\)/);
  const reopenUpd = routes.search(/UPDATE\s+accounting\.periods[\s\S]{0,80}?status\s*=\s*'open'/);
  if (reopenGate < 0) errors.push(`${ROUTES}: reopen route does not resolve isEnabled(client, MONEY_CONTROL_PERIOD_REOPEN_FLAG_KEY, …)`);
  if (reopenThrow < 0) errors.push(`${ROUTES}: reopen route does not throw 'period_reopen_disabled' when OFF`);
  if (reopenGate >= 0 && reopenUpd >= 0 && reopenGate > reopenUpd)
    errors.push(`${ROUTES}: period-reopen gate must run BEFORE the status='open' UPDATE`);

  // (3) route maps both to 409
  if (!/period_close_disabled["'][\s\S]{0,80}?reply\.code\(409\)/.test(routes))
    errors.push(`${ROUTES}: does not map 'period_close_disabled' → 409`);
  if (!/period_reopen_disabled["'][\s\S]{0,80}?reply\.code\(409\)/.test(routes))
    errors.push(`${ROUTES}: does not map 'period_reopen_disabled' → 409`);

  // (4) per-entity-only
  const perEntity = /PER_ENTITY_ONLY_FLAG_KEYS[\s\S]*?\]\)/.exec(flagService);
  for (const key of [CLOSE_KEY, REOPEN_KEY]) {
    if (!perEntity || !perEntity[0].includes(key))
      errors.push(`${FLAG_SERVICE}: ${key} is not in PER_ENTITY_ONLY_FLAG_KEYS`);
  }

  // (5) seeded default OFF
  const mig = stripSql(migration);
  if (!seededDefaultOff(mig, CLOSE_KEY))
    errors.push(`${MIGRATION}: ${CLOSE_KEY} must be seeded with default_enabled = false`);
  if (!seededDefaultOff(mig, REOPEN_KEY))
    errors.push(`${MIGRATION}: ${REOPEN_KEY} must be seeded with default_enabled = false`);

  return errors;
}

const read = (rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};

function selftest() {
  const good = {
    routes:
      `const MONEY_CONTROL_PERIOD_CLOSE_FLAG_KEY = "${CLOSE_KEY}";\n` +
      `const MONEY_CONTROL_PERIOD_REOPEN_FLAG_KEY = "${REOPEN_KEY}";\n` +
      `const closeEnabled = await isEnabled(client, MONEY_CONTROL_PERIOD_CLOSE_FLAG_KEY, {});\n` +
      `if (!closeEnabled) throw new Error("period_close_disabled");\n` +
      `await client.query("BEGIN");\n` +
      `if (msg === "period_close_disabled") return reply.code(409).send({});\n` +
      `const reopenEnabled = await isEnabled(client, MONEY_CONTROL_PERIOD_REOPEN_FLAG_KEY, {});\n` +
      `if (!reopenEnabled) throw new Error("period_reopen_disabled");\n` +
      `await client.query(\`UPDATE accounting.periods SET status = 'open'\`);\n` +
      `if (msg === "period_reopen_disabled") return reply.code(409).send({});`,
    flagService: `export const PER_ENTITY_ONLY_FLAG_KEYS = new Set(["${CLOSE_KEY}", "${REOPEN_KEY}"])`,
    migration: `VALUES ('${CLOSE_KEY}', 'd', false, 0), ('${REOPEN_KEY}', 'd', false, 0)`,
  };
  const cases = [
    { name: "well-formed → 0", in: good, want: 0 },
    { name: "close gate after BEGIN → err", in: { ...good, routes: good.routes.replace(
      `const closeEnabled = await isEnabled(client, MONEY_CONTROL_PERIOD_CLOSE_FLAG_KEY, {});\nif (!closeEnabled) throw new Error("period_close_disabled");\nawait client.query("BEGIN");`,
      `await client.query("BEGIN");\nconst closeEnabled = await isEnabled(client, MONEY_CONTROL_PERIOD_CLOSE_FLAG_KEY, {});\nif (!closeEnabled) throw new Error("period_close_disabled");`) }, wantMin: 1 },
    { name: "missing reopen 409 → err", in: { ...good, routes: good.routes.replace(/if \(msg === "period_reopen_disabled"\) return reply\.code\(409\)\.send\(\{\}\);/, "") }, wantMin: 1 },
    { name: "not per-entity-only → err", in: { ...good, flagService: `PER_ENTITY_ONLY_FLAG_KEYS = new Set([])` }, wantMin: 2 },
    { name: "close default ON → err", in: { ...good, migration: `VALUES ('${CLOSE_KEY}', 'd', true, 0), ('${REOPEN_KEY}', 'd', false, 0)` }, wantMin: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGate(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const inputs = { routes: read(ROUTES), flagService: read(FLAG_SERVICE), migration: read(MIGRATION) };
for (const [k, v] of Object.entries(inputs)) {
  if (v == null) { console.error(`[${LABEL}] FAILED — missing file for ${k}`); process.exit(1); }
}
const errors = assertGate(inputs);
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — period close/reopen gated behind AF-7 per-entity flags (default OFF), policy-error before any mutation.`);
