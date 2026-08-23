#!/usr/bin/env node
/**
 * Load drawer Settlement summary must resolve the same load as FinesDeductionsCard
 * (for-load / settlement_lines), not only settlement_model='load_bookended'.
 *
 * FAIL: WHERE requires settlement_model = 'load_bookended' alone (hides NULL-model
 *       settlements that still have first/last_load_id — live USMCA S-2026-0002).
 * PASS: dual-path first/last_load_id OR EXISTS settlement_lines/driver_bills.load_id;
 *       route declares rateLimit.
 *
 * Self-test: node scripts/verify-load-settlement-summary-resolves-line-linked.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-settlement-summary-resolves-line-linked";
const ROUTES = path.join(ROOT, "apps/backend/src/dispatch/load-settlement-summary.routes.ts");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(ROUTES, "utf8");
  assert(
    /\/api\/v1\/dispatch\/loads\/:loadId\/settlement-summary/.test(src),
    "must mount GET /api/v1/dispatch/loads/:loadId/settlement-summary"
  );
  assert(/rateLimit:\s*\{\s*max:\s*\d+/.test(src), "auth route must declare rateLimit config");
  assert(
    !/AND\s+s\.settlement_model\s*=\s*'load_bookended'/.test(src),
    "must not WHERE-filter settlement_model='load_bookended' alone (NULL-model live settlements)"
  );
  assert(/s\.first_load_id\s*=\s*\$2/.test(src), "must match first_load_id");
  assert(/s\.last_load_id\s*=\s*\$2/.test(src), "must match last_load_id");
  assert(
    /EXISTS\s*\([\s\S]*settlement_lines[\s\S]*driver_bills[\s\S]*COALESCE\(db\.load_id,\s*sl\.load_id\)/.test(
      src
    ),
    "must EXISTS settlement_lines / driver_bills.load_id path (for-load parity)"
  );
  assert(
    /settlement_summary_driver_dca\.driver_id = d\.id[\s\S]{0,180}settlement_summary_driver_dca\.company_id = \$2::uuid[\s\S]{0,180}settlement_summary_driver_dca\.is_authorized = true[\s\S]{0,180}settlement_summary_driver_dca\.deactivated_at IS NULL/.test(src),
    "driver label must admit active selected-company authorization"
  );
}

function selftest() {
  const original = fs.readFileSync(ROUTES, "utf8");
  const broken = original.replace(
    /AND \(\s*s\.first_load_id[\s\S]*?\)\s*ORDER BY/m,
    `AND s.settlement_model = 'load_bookended'\n           AND (s.first_load_id = $2 OR s.last_load_id = $2)\n         ORDER BY`
  );
  assert(broken !== original, "--selftest plant must mutate dual-path WHERE");
  fs.writeFileSync(ROUTES, broken);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  } finally {
    fs.writeFileSync(ROUTES, original);
  }
  assert(failed, "--selftest expected FAIL when load_bookended-only filter is restored");
  const noSharedDriver = original.replace("settlement_summary_driver_dca.is_authorized = true", "settlement_summary_driver_dca.is_authorized = false");
  assert(noSharedDriver !== original, "--selftest plant must mutate shared-driver authorization");
  fs.writeFileSync(ROUTES, noSharedDriver);
  failed = false;
  try {
    check();
  } catch {
    failed = true;
  } finally {
    fs.writeFileSync(ROUTES, original);
  }
  assert(failed, "--selftest expected FAIL when shared-driver authorization is disabled");
  check();
  console.log(`${LABEL}: OK — selftest PASS`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
