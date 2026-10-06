#!/usr/bin/env node
/**
 * GO-0021-BREAK-EVEN-ROUTE-NEVER-REGISTERED — leftover unique (500/dead/silent), /reports /cash-flow
 * /finance scope.
 *
 * apps/backend/src/accounting/break-even.routes.ts defines GET /api/v1/finance/break-even (F1
 * Break-Even Analysis) — well-built, flag-gated, membership-checked, 8/8 passing unit tests — but
 * `registerBreakEvenRoutes` was never imported or called anywhere in apps/backend/src/index.ts. The
 * frontend (BreakEvenPage.tsx -> getBreakEvenInputs -> this exact path) 404s every time.
 *
 * Live-confirmed NOT dormant: lib.feature_flag_overrides has FINANCE_BREAK_EVEN_UI_ENABLED=true for
 * all 3 real operating companies today — this route is reachable and broken right now, not a
 * theoretical future gap. The route's own existing test file (break-even.readonly.test.ts) registers
 * the route's `default` fastify-plugin export DIRECTLY, bypassing index.ts entirely — which is
 * exactly why 8 passing unit tests never caught the wiring gap. This guard closes that blind spot by
 * checking index.ts itself, not the route file.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const INDEX_FILE = "apps/backend/src/index.ts";

function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

const ROUTE_FILE = "apps/backend/src/accounting/break-even.routes.ts";

// LST-F413: BOOT-DUP-GET-FINANCE-BREAK-EVEN (62737ff7ca) removed the explicit index.ts import + call on purpose — with the
// accounting/*.routes.ts autoload ALSO mounting the file's default fp, Fastify threw a duplicate GET and the server never
// bound its port. The route is registered exactly once: by its own default fp export, and never by index.ts as well.
export function check(indexRaw, routeRaw) {
  const index = stripLineComments(indexRaw);
  const route = stripLineComments(routeRaw);
  const failures = [];
  if (!/export\s+default\s+fp\(\s*async\s*\(\s*app\s*\)\s*=>\s*\{\s*await\s+registerBreakEvenRoutes\s*\(\s*app\s*\)/.test(route)) {
    failures.push(`${ROUTE_FILE}: the default fp export no longer registers registerBreakEvenRoutes(app) — GET /api/v1/finance/break-even will 404 (GO-0021-BREAK-EVEN-ROUTE-NEVER-REGISTERED)`);
  }
  if (/await\s+registerBreakEvenRoutes\s*\(\s*app\s*\)/.test(index)) {
    failures.push(`${INDEX_FILE}: calls registerBreakEvenRoutes(app) while the autoload also mounts the default fp — duplicate GET, the server never binds (BOOT-DUP-GET-FINANCE-BREAK-EVEN)`);
  }
  return failures;
}

function readSrc() {
  return [fs.readFileSync(path.join(root, INDEX_FILE), "utf8"), fs.readFileSync(path.join(root, ROUTE_FILE), "utf8")];
}

function run() {
  const failures = check(...readSrc());
  if (failures.length > 0) {
    console.error("FAIL: break-even-route-wired");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: GET /api/v1/finance/break-even is mounted exactly once (its default fp; index.ts does not also call it)");
}

function selftest() {
  const [index, route] = readSrc();
  const baseline = check(index, route);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }
  const unregistered = route.replace(/await\s+registerBreakEvenRoutes\s*\(\s*app\s*\);(\s*\}\s*,\s*\{\s*name:)/, "$1");
  const doubled = `${index}\nawait registerBreakEvenRoutes(app);\n`;
  for (const [name, i, r] of [["default fp stops registering", index, unregistered], ["index.ts double-mounts", doubled, route]]) {
    if (i === index && r === route) {
      console.error(`FAIL(selftest): ${name} — mutation did not change the source (pattern out of sync)`);
      process.exit(1);
    }
    if (check(i, r).length === 0) {
      console.error(`FAIL(selftest): ${name} — NOT caught`);
      process.exit(1);
    }
  }
  console.log("PASS(selftest): 2/2 planted regressions caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
