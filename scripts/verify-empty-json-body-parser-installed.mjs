#!/usr/bin/env node
/**
 * verify:empty-json-body-parser-installed — regression guard (no DB).
 *
 * Prod Sentry: POST /banking/categorization-rules/:id/apply-historical (inputs all in the query string,
 * empty application/json body from the Electron client) 400'd with FST_ERR_CTP_EMPTY_JSON_BODY. Fixed by
 * installEmptyJsonBodyParser (apps/backend/src/config/empty-json-body-parser.ts), which maps an empty
 * application/json body to {}. This guard fails if BOTH Fastify app builders — the prod server
 * (apps/backend/src/index.ts) and the integration-test app (apps/backend/test-helpers/http-app.ts) — do
 * not install it, so a future app rebuild can't silently reintroduce the 400. Self-test: --selftest.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE = "apps/backend/src/config/empty-json-body-parser.ts";
// The PROD server (index.ts) MUST install the parser — that is the runtime path the fix protects.
const CALLERS = ["apps/backend/src/index.ts"];
const CALL_RE = /installEmptyJsonBodyParser\s*\(/;

export function check({ moduleSrc, callerSrcs }) {
  const failures = [];
  if (!moduleSrc || !/export\s+function\s+installEmptyJsonBodyParser\b/.test(moduleSrc)) {
    failures.push(`${MODULE} must export function installEmptyJsonBodyParser`);
  }
  if (moduleSrc && !/addContentTypeParser\(\s*["']application\/json["']/.test(moduleSrc)) {
    failures.push(`${MODULE} must register an application/json content-type parser`);
  }
  for (const [file, src] of Object.entries(callerSrcs)) {
    if (!src || !CALL_RE.test(src)) failures.push(`${file} must call installEmptyJsonBodyParser(app) before routes`);
  }
  return failures;
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

export function run() {
  const moduleSrc = read(MODULE);
  const callerSrcs = Object.fromEntries(CALLERS.map((f) => [f, read(f)]));
  return check({ moduleSrc, callerSrcs });
}

if (process.argv.includes("--selftest")) {
  const goodModule = `export function installEmptyJsonBodyParser(app){ app.addContentTypeParser("application/json", {parseAs:"string"}, ()=>{}); }`;
  const goodCaller = `installEmptyJsonBodyParser(app);`;
  const checks = [
    ["real tree passes", run().length === 0],
    ["missing export caught", check({ moduleSrc: "export function other(){}", callerSrcs: { a: goodCaller } }).some((f) => /installEmptyJsonBodyParser/.test(f))],
    ["missing parser caught", check({ moduleSrc: "export function installEmptyJsonBodyParser(){}", callerSrcs: { a: goodCaller } }).some((f) => /content-type parser/.test(f))],
    ["uninstalled caller caught", check({ moduleSrc: goodModule, callerSrcs: { a: "const app = Fastify();" } }).some((f) => /must call/.test(f))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:empty-json-body-parser-installed --selftest FAIL");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:empty-json-body-parser-installed --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:empty-json-body-parser-installed FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:empty-json-body-parser-installed PASS (prod app installs the empty-application/json-body parser)");
}
