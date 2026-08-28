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

export function check(srcRaw) {
  const src = stripLineComments(srcRaw);
  const failures = [];

  if (!/import\s*\{\s*registerBreakEvenRoutes\s*\}\s*from\s*["']\.\/accounting\/break-even\.routes\.js["']/.test(src)) {
    failures.push(`${INDEX_FILE}: registerBreakEvenRoutes is not imported from ./accounting/break-even.routes.js — GET /api/v1/finance/break-even will 404 (GO-0021-BREAK-EVEN-ROUTE-NEVER-REGISTERED)`);
  }

  if (!/await\s+registerBreakEvenRoutes\s*\(\s*app\s*\)/.test(src)) {
    failures.push(`${INDEX_FILE}: registerBreakEvenRoutes(app) is never called — GET /api/v1/finance/break-even will 404 (GO-0021-BREAK-EVEN-ROUTE-NEVER-REGISTERED)`);
  }

  return failures;
}

function readSrc() {
  return fs.readFileSync(path.join(root, INDEX_FILE), "utf8");
}

function run() {
  const failures = check(readSrc());
  if (failures.length > 0) {
    console.error("FAIL: break-even-route-wired");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: GET /api/v1/finance/break-even stays registered in index.ts");
}

function selftest() {
  const src = readSrc();
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Offender: remove the registration call (simulate the exact original defect).
  const offender = src.replace(/\n\s*await registerBreakEvenRoutes\(app\);/, "");
  if (offender === src) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (registration call removed) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
