#!/usr/bin/env node
/**
 * ACCT-R-13 — Settlement Approval mount guard.
 *
 * registerSettlementApprovalRoutes (apps/backend/src/settlements/approval.routes.ts) was BUILT but
 * never called from apps/backend/src/index.ts — all 9 D1 approval-workflow endpoints (settlement
 * summary, line approve/reject, settlement approve/finalize, trip-link queue, PDF gate) were a live
 * 404. This guard locks the mount so it cannot silently regress back to unmounted.
 *
 * registerSettlementsMvpRoutes (driver-finance/settlements-mvp.routes.ts) is a SEPARATE, still
 * intentionally UNMOUNTED route file (dual-path risk vs the canonical driver_finance settlement
 * engine — see scripts/verify-no-orphan-routes.mjs). This guard does not touch it and does not
 * require it to be mounted.
 *
 * --selftest mutates the REAL apps/backend/src/index.ts (strips every line mentioning
 * registerSettlementApprovalRoutes), proves the check fails, then restores the original file
 * content from an in-memory backup in a `finally` block — no synthetic fixture strings.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const INDEX = "apps/backend/src/index.ts";
const ROUTES = "apps/backend/src/settlements/approval.routes.ts";
const LABEL = "verify-acct-r13-settlement-approval-mounted";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check(indexSrc, routesSrc) {
  const errors = [];
  if (!/export\s+async\s+function\s+registerSettlementApprovalRoutes\s*\(/.test(routesSrc)) {
    errors.push(`${ROUTES}: must export async function registerSettlementApprovalRoutes(app)`);
  }
  if (
    !/import\s*\{\s*registerSettlementApprovalRoutes\s*\}\s*from\s*["']\.\/settlements\/approval\.routes\.js["']/.test(
      indexSrc
    )
  ) {
    errors.push(
      `${INDEX}: missing import of registerSettlementApprovalRoutes from ./settlements/approval.routes.js`
    );
  }
  if (!/\bawait\s+registerSettlementApprovalRoutes\s*\(\s*app\s*\)/.test(indexSrc)) {
    errors.push(
      `${INDEX}: missing call site await registerSettlementApprovalRoutes(app) — this was the live-404 bug (ACCT-R-13)`
    );
  }
  return errors;
}

function main() {
  const args = process.argv.slice(2);
  const realIndexPath = path.join(ROOT, INDEX);

  if (args.includes("--selftest")) {
    const routesSrc = read(ROUTES);
    const backup = fs.readFileSync(realIndexPath, "utf8");
    try {
      const goodErrors = check(backup, routesSrc);
      if (goodErrors.length !== 0) {
        console.error(`[${LABEL}] SELFTEST FAIL: real mounted index.ts flagged as bad:`, goodErrors);
        process.exit(1);
      }

      // Plant the exact regression this guard exists to catch: drop every line referencing the
      // symbol (import line + call line) from the REAL index.ts, then re-run the same check.
      const mutated = backup
        .split("\n")
        .filter((line) => !line.includes("registerSettlementApprovalRoutes"))
        .join("\n");
      if (mutated === backup) {
        console.error(`[${LABEL}] SELFTEST SETUP FAIL: could not locate registerSettlementApprovalRoutes in index.ts to mutate`);
        process.exit(1);
      }
      fs.writeFileSync(realIndexPath, mutated, "utf8");
      const plantedErrors = check(mutated, routesSrc);
      if (plantedErrors.length === 0) {
        console.error(`[${LABEL}] SELFTEST FAIL: planted unmount regression was not caught`);
        process.exit(1);
      }
      console.log(`[${LABEL}] SELFTEST PASS (${plantedErrors.length} planted failure(s) detected)`);
    } finally {
      fs.writeFileSync(realIndexPath, backup, "utf8");
    }
    process.exit(0);
  }

  const indexSrc = read(INDEX);
  const routesSrc = read(ROUTES);
  const errors = check(indexSrc, routesSrc);
  if (errors.length > 0) {
    console.error(`[${LABEL}] FAILED:`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — registerSettlementApprovalRoutes is mounted in index.ts (ACCT-R-13)`);
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
