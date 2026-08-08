#!/usr/bin/env node
// verify-catalog-config-physical-columns (CLS-SCHEMA-DRIFT)
// generic-catalog.factory.ts used to reference `deactivated_at` unconditionally in its list/update/
// delete/restore SQL. Postgres resolves column references at PLAN time, so any catalog table lacking
// the physical column 500'd on EVERY request touching that code path — live-confirmed 2026-08-06:
// 24 of 30 generic catalog tables have no `deactivated_at` column, yet the factory referenced it
// unconditionally (LV-CAT-500).
//
// The fix requires every GenericCatalogConfig to declare an explicit `hasDeactivatedAt: boolean`
// (no default — the author must state the physical shape), and gates all 4 `deactivated_at` SQL
// references in the factory on that flag. This guard enforces BOTH halves of that fix stay in place:
//   1. Every config object in generic-catalog.routes.ts declares hasDeactivatedAt.
//   2. Every bare `deactivated_at` reference inside generic-catalog.factory.ts's SQL template
//      literals is gated by `config.hasDeactivatedAt` (not unconditional).
// Self-test: --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES_FILE = "apps/backend/src/catalogs/generic-catalog.routes.ts";
const FACTORY_FILE = "apps/backend/src/catalogs/generic-catalog.factory.ts";

/** Every `tableName: "..."` config block must declare `hasDeactivatedAt: true|false` before the next config starts. */
export function findMissingHasDeactivatedAt(routesSource) {
  const offenders = [];
  const tableRe = /tableName:\s*"([a-z_]+)"/g;
  let m;
  const matches = [];
  while ((m = tableRe.exec(routesSource)) !== null) matches.push({ name: m[1], index: m.index });
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : routesSource.length;
    const block = routesSource.slice(start, end);
    if (!/hasDeactivatedAt:\s*(true|false)/.test(block)) {
      offenders.push(matches[i].name);
    }
  }
  return offenders;
}

/**
 * Every literal `deactivated_at` token inside the factory must appear only within a
 * `config.hasDeactivatedAt` conditional (ternary or `&&`-gated). A bare, unconditional reference
 * inside a SQL template string is the regression this guard exists to catch.
 */
const GATE_WINDOW = 3; // lines to look back for a controlling `config.hasDeactivatedAt` (if-guard or ternary head)

export function findUngatedDeactivatedAtRefs(factorySource) {
  const offenders = [];
  const lines = factorySource.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/deactivated_at/.test(line)) continue;
    if (/\*|hasDeactivatedAt boolean|CLS-SCHEMA-DRIFT/.test(line)) continue; // comment/doc lines
    const windowStart = Math.max(0, i - GATE_WINDOW);
    const window = lines.slice(windowStart, i + 1).join("\n");
    if (/hasDeactivatedAt/.test(window)) continue; // gated by an if(...) or ternary within the window
    offenders.push({ line: i + 1, text: line.trim() });
  }
  return offenders;
}

function run() {
  const failures = [];
  const routesSrc = fs.readFileSync(path.join(ROOT, ROUTES_FILE), "utf8");
  const factorySrc = fs.readFileSync(path.join(ROOT, FACTORY_FILE), "utf8");

  const missing = findMissingHasDeactivatedAt(routesSrc);
  for (const name of missing) {
    failures.push(`${ROUTES_FILE}: catalog '${name}' has no explicit hasDeactivatedAt declaration`);
  }

  const ungated = findUngatedDeactivatedAtRefs(factorySrc);
  for (const off of ungated) {
    failures.push(`${FACTORY_FILE}:${off.line} — unconditional 'deactivated_at' reference, not gated on config.hasDeactivatedAt: ${off.text}`);
  }

  return failures;
}

export { run };

if (process.argv.includes("--selftest")) {
  const goodRoutes = `export const a: GenericCatalogConfig = {\n  tableName: "foo",\n  hasDeactivatedAt: true,\n};\nexport const b: GenericCatalogConfig = {\n  tableName: "bar",\n  hasDeactivatedAt: false,\n};`;
  const badRoutes = `export const a: GenericCatalogConfig = {\n  tableName: "foo",\n};\nexport const b: GenericCatalogConfig = {\n  tableName: "bar",\n  hasDeactivatedAt: false,\n};`;

  const goodFactory = `where.push(config.hasDeactivatedAt ? \`t.x = true AND t.deactivated_at IS NULL\` : \`t.x = true\`);`;
  const goodFactoryMultiline = `if (config.hasDeactivatedAt && x === false) {\n  add("deactivated_at", new Date().toISOString());\n}`;
  const badFactory = `where.push(\`t.x = true AND t.deactivated_at IS NULL\`);`;
  const badFactoryFarGate = `if (config.hasDeactivatedAt) {\n}\n\n\n\n\nadd("deactivated_at", null);`;

  const checks = [
    ["all configs declaring hasDeactivatedAt pass clean", findMissingHasDeactivatedAt(goodRoutes).length === 0],
    ["a config missing hasDeactivatedAt is flagged", findMissingHasDeactivatedAt(badRoutes).length === 1],
    ["a same-line gated deactivated_at reference passes clean", findUngatedDeactivatedAtRefs(goodFactory).length === 0],
    ["an if(hasDeactivatedAt){ ref } multi-line gate passes clean", findUngatedDeactivatedAtRefs(goodFactoryMultiline).length === 0],
    ["an unconditional deactivated_at reference is flagged (regression re-plant)", findUngatedDeactivatedAtRefs(badFactory).length === 1],
    ["a deactivated_at reference outside the gate window is still flagged", findUngatedDeactivatedAtRefs(badFactoryFarGate).length === 1],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify-catalog-config-physical-columns --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify-catalog-config-physical-columns --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify-catalog-config-physical-columns FAIL — a generic catalog config's physical column shape is unverified or ungated:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify-catalog-config-physical-columns PASS — every catalog config declares hasDeactivatedAt; every deactivated_at SQL reference in the factory is gated on it");
}
