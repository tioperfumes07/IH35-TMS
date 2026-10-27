#!/usr/bin/env node
/**
 * verify-one-fuel-to-load-helper — 443.324 ENG-25 (CC-3 claim 18769).
 *
 * Every path from a fuel transaction to a load must go through the single shared helper
 * resolveFuelLoadAtTime (fuel/fuel-load-at-time.ts). A separate local resolveLoadId in the
 * import path would apply a different window (±1 day) than the canonical helper (actual stop
 * stamps, then appointment/scheduled, then schedule-only), causing misattribution.
 *
 * FINDING: fuel-transaction-import.ts already imports and calls resolveFuelLoadAtTime at line 32
 * (import) and line 355 (call). No local resolveLoadId exists in the fuel module. Guard is green.
 *
 * STATIC ONLY: reads source files, no database.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const LABEL = "verify-one-fuel-to-load-helper";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT_PATH = "apps/backend/src/fuel/fuel-transaction-import.ts";
const BANK_PATH = "apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.ts";
const HELPER_PATH = "apps/backend/src/fuel/fuel-load-at-time.ts";
const CANONICAL_IMPORT = "resolveFuelLoadAtTime";
const FORBIDDEN_LOCAL = "resolveLoadId";

export function analyse(src, file = IMPORT_PATH) {
  const failures = [];
  const tree = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let imported = false;
  let awaitedCall = false;
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings) && bindings.elements.some(e =>
          ['loadAtTimeSql', 'loadAtTimeForDriverSql'].includes(e.propertyName?.text ?? e.name.text))) {
        failures.push(`${file} imports a lower-level rule (including aliases) instead of the canonical resolver`);
      }
      if (node.moduleSpecifier.text.endsWith('/fuel-load-at-time.js') &&
          !node.importClause?.isTypeOnly && bindings && ts.isNamedImports(bindings)) {
        imported ||= bindings.elements.some(e => !e.isTypeOnly &&
          e.name.text === CANONICAL_IMPORT && (e.propertyName?.text ?? e.name.text) === CANONICAL_IMPORT);
      }
    }
    if (ts.isAwaitExpression(node) && ts.isCallExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) && node.expression.expression.text === CANONICAL_IMPORT) awaitedCall = true;
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) &&
        node.name && ts.isIdentifier(node.name) && node.name.text === FORBIDDEN_LOCAL) {
      failures.push(`${file} defines a local ${FORBIDDEN_LOCAL} — must delegate to resolveFuelLoadAtTime`);
    }
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
        node.name && ts.isIdentifier(node.name) && node.name.text === CANONICAL_IMPORT) {
      failures.push(`${file} shadows the canonical resolver import`);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        ['loadAtTimeSql', 'loadAtTimeForDriverSql'].includes(node.expression.text)) {
      failures.push(`${file} calls a lower-level load rule instead of the canonical resolver`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  if (!imported) failures.push(`${file} does not import ${CANONICAL_IMPORT} from fuel-load-at-time.js`);
  if (!awaitedCall) failures.push(`${file} does not await ${CANONICAL_IMPORT}`);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const realSrc = fs.readFileSync(path.join(ROOT, IMPORT_PATH), "utf8");
  const cases = [
    ["real tree green", analyse(realSrc).length === 0],
    ["missing import fails", analyse("// no import here").length > 0],
    ["local resolveLoadId fails independently", analyse(realSrc + '\nconst resolveLoadId = () => {};').some(f => f.includes('defines a local'))],
  ];
  for (const file of [IMPORT_PATH, BANK_PATH]) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    cases.push([`${file}: clean`, analyse(source, file).length === 0]);
    const noCall = source.replace(/await resolveFuelLoadAtTime\(/g, 'await oldRule(');
    cases.push([`${file}: import/comments without call rejected`, noCall !== source && analyse(noCall, file).length > 0]);
    const noImport = source.replace(/fuel-load-at-time\.js/g, 'different-rule.js');
    cases.push([`${file}: wrong import rejected`, noImport !== source && analyse(noImport, file).length > 0]);
    const unawaited = source.replace(/await resolveFuelLoadAtTime\(/g, 'resolveFuelLoadAtTime(');
    cases.push([`${file}: unawaited call rejected`, unawaited !== source && analyse(unawaited, file).length > 0]);
    cases.push([`${file}: parallel SQL rule rejected`, analyse(source + '\nloadAtTimeSql("unit", "at");', file).length > 0]);
    cases.push([`${file}: aliased SQL rule rejected`, analyse(source + '\nimport {loadAtTimeSql as oldRule} from "./old.js"; oldRule();', file).length > 0]);
    cases.push([`${file}: shadowed resolver rejected`, analyse(source + '\nasync function planted(resolveFuelLoadAtTime) { await resolveFuelLoadAtTime(); }', file).length > 0]);
  }
  cases.push(['comment-only wiring rejected', analyse('// import {resolveFuelLoadAtTime} from "./fuel-load-at-time.js"; await resolveFuelLoadAtTime();').length > 0]);
  for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const abs = path.join(ROOT, IMPORT_PATH);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL}: FAIL — ${IMPORT_PATH} not found`);
  process.exit(1);
}

const src = fs.readFileSync(abs, "utf8");
const helperAbs = path.join(ROOT, HELPER_PATH);
if (!fs.existsSync(helperAbs)) {
  console.error(`${LABEL}: FAIL — ${HELPER_PATH} (canonical helper) not found`);
  process.exit(1);
}

const failures = [...analyse(src), ...analyse(fs.readFileSync(path.join(ROOT, BANK_PATH), 'utf8'), BANK_PATH)];
if (failures.length) {
  console.error(`${LABEL}: FAIL\n  ${failures.join("\n  ")}`);
  process.exit(1);
}

console.log(`${LABEL}: OK — import and bank-match paths import and await ${CANONICAL_IMPORT}; no local ${FORBIDDEN_LOCAL} or parallel SQL resolver.`);
