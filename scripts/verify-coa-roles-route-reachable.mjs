#!/usr/bin/env node
/**
 * verify-coa-roles-route-reachable — pins the CoA-roles route registration chain so the
 * /api/v1/accounting/coa-roles endpoints can never silently 404.
 *
 * BACKGROUND / LIVE PROOF (2026-07-21, origin/main 60b69dc9d):
 *   An owner-corrected narrative claimed the CoA-roles API was "never registered" (so
 *   CoaRolesPage was dead). That claim is FALSE. A boot-time route dump (bare Fastify +
 *   `registerAccountingRoutes(app)` + onRoute capture / printRoutes) shows the endpoints
 *   register at their absolute paths purely via @fastify/autoload:
 *       GET  /api/v1/accounting/coa-roles
 *       PUT  /api/v1/accounting/coa-roles
 *       GET  /api/v1/accounting/coa-roles/validate
 *   Mechanism: accounting/index.ts autoloads every `*.routes.{ts,js}` under accounting/,
 *   and coa-roles/coa-roles.routes.ts is `export default fp(registerCoaRolesRoutes)`.
 *   Because it is wrapped in fastify-plugin (fp), autoload's dir-name prefix does NOT apply,
 *   so the routes land at their absolute paths even though the file lives in a subdirectory.
 *   (Contrast: cash-flow/cash-forecast/finance-hub are named-export-only — no default fp —
 *   so autoload skips them and they are mounted explicitly in index.ts.)
 *
 * WHY THIS GUARD: the reachability is silent. If coa-roles.routes.ts drops its
 * `export default fp(...)`, or accounting/index.ts stops autoloading `.routes.` files, or
 * coa-roles gets added to the autoload ignorePattern WITHOUT an explicit mount, the three
 * endpoints 404 with no other failure. This guard fails loudly if the registrar becomes
 * unreachable by BOTH paths (autoload include OR explicit mount in index.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-coa-roles-route-reachable";

const FILES = {
  routes: "apps/backend/src/accounting/coa-roles/routes.ts",
  plugin: "apps/backend/src/accounting/coa-roles/coa-roles.routes.ts",
  accIndex: "apps/backend/src/accounting/index.ts",
  appIndex: "apps/backend/src/index.ts",
};

const ROUTE_PATH = "/api/v1/accounting/coa-roles";
const PLUGIN_BASENAME = "coa-roles.routes.ts";
const PLUGIN_RELPATH = "accounting/coa-roles/coa-roles.routes.ts";

/**
 * Extract the `ignorePattern: /.../flags` regex literal from accounting/index.ts source.
 *
 * Parsed with a LINEAR single-pass scanner rather than a regex. The previous
 * `/((?:\\.|\[[^\]]*\]|[^/\\\n])*)/` form was ambiguous — `\[[^\]]*\]` and `[^/\\\n]` can both
 * match the same `[...]` text — so it backtracked exponentially (CodeQL js/redos; measured
 * ~1s on 24 repetitions of `[]`, and it doubles per repetition). A scanner cannot backtrack,
 * so the cost is strictly O(n) on any input.
 */
function extractIgnorePattern(accIndexSrc) {
  const key = accIndexSrc.search(/ignorePattern:\s*\//);
  if (key === -1) return null;
  const open = accIndexSrc.indexOf("/", key + "ignorePattern:".length - 1);
  if (open === -1) return null;

  let body = "";
  let inClass = false;
  let i = open + 1;
  for (; i < accIndexSrc.length; i++) {
    const c = accIndexSrc[i];
    if (c === "\n") return null; // regex literals do not span lines
    if (c === "\\") {
      const next = accIndexSrc[i + 1];
      if (next === undefined || next === "\n") return null;
      body += c + next;
      i++;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) break; // unescaped, outside a class → closing delimiter
    body += c;
  }
  if (i >= accIndexSrc.length || accIndexSrc[i] !== "/") return null;

  let flags = "";
  for (let j = i + 1; j < accIndexSrc.length; j++) {
    const f = accIndexSrc[j];
    if (f < "a" || f > "z") break;
    flags += f;
  }

  try {
    return new RegExp(body, flags);
  } catch {
    return null;
  }
}

/** True if the autoload ignorePattern would exclude the coa-roles plugin file. */
function isPluginIgnored(accIndexSrc) {
  const re = extractIgnorePattern(accIndexSrc);
  if (re) {
    return re.test(PLUGIN_BASENAME) || re.test(PLUGIN_RELPATH);
  }
  // Fallback: could not parse the literal — treat any coa-roles mention in the ignorePattern as ignored.
  return /ignorePattern:[^\n]*coa-roles/.test(accIndexSrc);
}

/**
 * Pure evaluator. Returns { ok, verdict, errors } given the four source strings.
 * ok=true means the registrar is reachable AND the route body/registrar exist.
 */
export function evaluate({ routesSrc, pluginSrc, accIndexSrc, appIndexSrc }) {
  const errors = [];

  // --- Registrar + route body must exist (required for BOTH reachability paths) ---
  const routesDefinesPath = routesSrc.includes(ROUTE_PATH);
  const routesExportsRegistrar = /export\s+async\s+function\s+registerCoaRolesRoutes\b/.test(routesSrc);
  if (!routesDefinesPath) {
    errors.push(`${FILES.routes}: must define the route path "${ROUTE_PATH}"`);
  }
  if (!routesExportsRegistrar) {
    errors.push(`${FILES.routes}: must export "async function registerCoaRolesRoutes"`);
  }

  // --- Path A: reachable via @fastify/autoload include ---
  const accUsesAutoload =
    accIndexSrc.includes("@fastify/autoload") &&
    /matchFilter:\s*\/\\\.routes\\\.\(ts\|js\)\$\//.test(accIndexSrc);
  const appRegistersAccounting = /await\s+registerAccountingRoutes\(app\)/.test(appIndexSrc);
  const pluginHasDefaultFp = /export\s+default\s+fp\(/.test(pluginSrc);
  const pluginCallsRegistrar = pluginSrc.includes("registerCoaRolesRoutes");
  const pluginIgnored = isPluginIgnored(accIndexSrc);

  const autoloadReasons = [];
  if (!accUsesAutoload) autoloadReasons.push(`${FILES.accIndex}: must autoload *.routes.{ts,js} via @fastify/autoload (matchFilter /\\.routes\\.(ts|js)$/)`);
  if (!appRegistersAccounting) autoloadReasons.push(`${FILES.appIndex}: must call "await registerAccountingRoutes(app)"`);
  if (!pluginHasDefaultFp) autoloadReasons.push(`${FILES.plugin}: must "export default fp(...)" (the @fastify/autoload contract)`);
  if (!pluginCallsRegistrar) autoloadReasons.push(`${FILES.plugin}: must call registerCoaRolesRoutes`);
  if (pluginIgnored) autoloadReasons.push(`${FILES.accIndex}: autoload ignorePattern excludes ${PLUGIN_BASENAME} (would orphan it)`);
  const autoloadOk = autoloadReasons.length === 0;

  // --- Path B: reachable via explicit mount in index.ts ---
  const appImportsRegistrar = /import\s*\{[^}]*\bregisterCoaRolesRoutes\b[^}]*\}\s*from\s*["'][^"']*coa-roles\/routes\.js["']/.test(appIndexSrc);
  const appAwaitsRegistrar = /await\s+registerCoaRolesRoutes\(app\)/.test(appIndexSrc);
  const explicitReasons = [];
  if (!appImportsRegistrar) explicitReasons.push(`${FILES.appIndex}: must import registerCoaRolesRoutes from coa-roles/routes.js`);
  if (!appAwaitsRegistrar) explicitReasons.push(`${FILES.appIndex}: must call "await registerCoaRolesRoutes(app)"`);
  const explicitOk = explicitReasons.length === 0;

  let verdict = "UNREACHABLE";
  if (autoloadOk && explicitOk) verdict = "reachable (autoload + explicit mount)";
  else if (autoloadOk) verdict = "reachable via autoload include";
  else if (explicitOk) verdict = "reachable via explicit mount";

  if (!autoloadOk && !explicitOk) {
    errors.push("CoA-roles registrar is UNREACHABLE — neither autoload include nor explicit mount is intact:");
    errors.push("  [autoload path blocked because]");
    for (const r of autoloadReasons) errors.push(`    - ${r}`);
    errors.push("  [explicit-mount path blocked because]");
    for (const r of explicitReasons) errors.push(`    - ${r}`);
  }

  return { ok: errors.length === 0, verdict, errors };
}

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function selftest() {
  const goodRoutes = `
    export async function registerCoaRolesRoutes(app) {
      app.get("${ROUTE_PATH}", async () => ({}));
      app.put("${ROUTE_PATH}", async () => ({}));
      app.get("${ROUTE_PATH}/validate", async () => ({}));
    }
  `;
  const goodPlugin = `
    import fp from "fastify-plugin";
    import { registerCoaRolesRoutes } from "./routes.js";
    export default fp(async (app) => { await registerCoaRolesRoutes(app); }, { name: "accounting.registerCoaRolesRoutes" });
  `;
  const goodAccIndex = `
    import autoload from "@fastify/autoload";
    await app.register(autoload, {
      dir: __dirname,
      matchFilter: /\\.routes\\.(ts|js)$/,
      ignorePattern: /(\\.test\\.|(^|\\/)cash-flow\\.routes\\.|(^|\\/)cash-forecast\\.routes\\.|(^|\\/)finance-hub\\.routes\\.)/,
    });
  `;
  const goodAppIndex = `await registerAccountingRoutes(app);`;

  // 1) current main state → reachable via autoload
  const r1 = evaluate({ routesSrc: goodRoutes, pluginSrc: goodPlugin, accIndexSrc: goodAccIndex, appIndexSrc: goodAppIndex });
  if (!r1.ok || r1.verdict !== "reachable via autoload include") {
    console.error(`${LABEL} --selftest FAIL good-autoload fixture:`, r1);
    process.exit(1);
  }

  // 2) coa-roles ADDED to ignorePattern BUT explicit mount added → still reachable (cash-flow pattern)
  const explicitAccIndex = goodAccIndex.replace(
    "(^|\\/)finance-hub\\.routes\\.",
    "(^|\\/)finance-hub\\.routes\\.|(^|\\/)coa-roles\\.routes\\."
  );
  const explicitAppIndex = `
    import { registerCoaRolesRoutes } from "./accounting/coa-roles/routes.js";
    await registerAccountingRoutes(app);
    await registerCoaRolesRoutes(app);
  `;
  const r2 = evaluate({ routesSrc: goodRoutes, pluginSrc: goodPlugin, accIndexSrc: explicitAccIndex, appIndexSrc: explicitAppIndex });
  if (!r2.ok || r2.verdict !== "reachable via explicit mount") {
    console.error(`${LABEL} --selftest FAIL good-explicit fixture:`, r2);
    process.exit(1);
  }

  // 3) BAD: plugin loses default fp AND no explicit mount → UNREACHABLE
  const badPlugin = goodPlugin.replace("export default fp(", "export const plugin = (");
  const r3 = evaluate({ routesSrc: goodRoutes, pluginSrc: badPlugin, accIndexSrc: goodAccIndex, appIndexSrc: goodAppIndex });
  if (r3.ok) {
    console.error(`${LABEL} --selftest FAIL: dropped default-fp with no explicit mount should be UNREACHABLE`, r3);
    process.exit(1);
  }

  // 4) BAD: coa-roles added to ignorePattern with NO explicit mount → UNREACHABLE
  const r4 = evaluate({ routesSrc: goodRoutes, pluginSrc: goodPlugin, accIndexSrc: explicitAccIndex, appIndexSrc: goodAppIndex });
  if (r4.ok) {
    console.error(`${LABEL} --selftest FAIL: ignored plugin with no explicit mount should be UNREACHABLE`, r4);
    process.exit(1);
  }

  // 5) BAD: routes.ts loses the route path → FAIL regardless of reachability
  const r5 = evaluate({ routesSrc: goodRoutes.replace(new RegExp(ROUTE_PATH, "g"), "/api/v1/accounting/nope"), pluginSrc: goodPlugin, accIndexSrc: goodAccIndex, appIndexSrc: goodAppIndex });
  if (r5.ok) {
    console.error(`${LABEL} --selftest FAIL: missing route path should fail`, r5);
    process.exit(1);
  }

  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const result = evaluate({
    routesSrc: readFile(FILES.routes),
    pluginSrc: readFile(FILES.plugin),
    accIndexSrc: readFile(FILES.accIndex),
    appIndexSrc: readFile(FILES.appIndex),
  });
  if (!result.ok) {
    console.error(`FAIL ${LABEL}: CoA-roles route registrar not proven reachable`);
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${ROUTE_PATH} registrar is ${result.verdict}.`);
}

main();
