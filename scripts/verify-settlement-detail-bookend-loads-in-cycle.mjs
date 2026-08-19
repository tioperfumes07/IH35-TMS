#!/usr/bin/env node
/**
 * Settlement detail "Loads in cycle" must include bookend first/last_load_* when
 * settlement_lines are empty (open pre-settlements) — otherwise reverse drill shows "—".
 *
 * FAIL: GET settlements/:id omits s.first_load_id / FE only walks settlement_lines.load_id.
 * PASS: routes SELECT bookend columns; SettlementDetailPage merges first/last_load into loadIds.
 *
 * Self-test: node scripts/verify-settlement-detail-bookend-loads-in-cycle.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-detail-bookend-loads-in-cycle";
const ROUTES = path.join(ROOT, "apps/backend/src/driver-finance/settlements.routes.ts");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const routes = fs.readFileSync(ROUTES, "utf8");
  // Isolate the GET :id settlement header SELECT (payment_state + first_load_id).
  assert(
    /\/api\/v1\/driver-finance\/settlements\/:id/.test(routes),
    "must mount GET /api/v1/driver-finance/settlements/:id"
  );
  assert(
    /s\.first_load_id[\s\S]*s\.first_load_number[\s\S]*s\.last_load_id[\s\S]*s\.last_load_number/.test(routes),
    "GET :id must SELECT s.first/last_load_id + numbers (bookend reverse)"
  );

  const page = fs.readFileSync(PAGE, "utf8");
  assert(/settlementLoadIds/.test(page), "SettlementDetailPage must build settlementLoadIds");
  assert(/first_load_id/.test(page) && /last_load_id/.test(page), "FE must merge bookend first/last_load_id");
  assert(/SettlementHeader/.test(page), "must pass loadIds to SettlementHeader");
}

function selftest() {
  const original = fs.readFileSync(ROUTES, "utf8");
  const broken = original.replace(
    /s\.first_load_id,\s*\n\s*s\.first_load_number,\s*\n\s*s\.last_load_id,\s*\n\s*s\.last_load_number/,
    "/* planted: bookends removed */"
  );
  assert(broken !== original, "--selftest plant must remove bookend SELECT");
  fs.writeFileSync(ROUTES, broken);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  } finally {
    fs.writeFileSync(ROUTES, original);
  }
  assert(failed, "--selftest expected FAIL when bookend SELECT removed");
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
