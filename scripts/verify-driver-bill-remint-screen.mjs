#!/usr/bin/env node
/**
 * ACCT-F10164 REMINT SCREEN (LAW-FIX-INSTANTLY register item 8 — bills never auto-created: 39
 * delivered loads with zero driver_bills, ~16 real, $14,789.50). The single-load remint route
 * (ACCT-F10164) closed the code gap; nothing made the affected set VISIBLE or gave a bulk action.
 * This guard locks: the backend list (GET, read-only) + apply-all (POST, role-gated, reuses the
 * shared mint) routes, and the frontend screen + its inbound link from DispatchOverview.tsx — an
 * orphan route with zero inbound links is its own known class of bug in this codebase.
 *
 *   node scripts/verify-driver-bill-remint-screen.mjs
 *   node scripts/verify-driver-bill-remint-screen.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-bill-remint-screen";
const ROUTES_FILE = "apps/backend/src/mdata/loads.routes.ts";
const SCREEN_FILE = "apps/frontend/src/pages/dispatch/DriverBillRemintScreen.tsx";
const MANIFEST_FILE = "apps/frontend/src/routes/manifest.tsx";
const OVERVIEW_FILE = "apps/frontend/src/pages/dispatch/DispatchOverview.tsx";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard(routesSrc, screenSrc, manifestSrc, overviewSrc) {
  const errs = [];
  if (!routesSrc) return [`${ROUTES_FILE}: missing`];

  if (!/"\/api\/v1\/mdata\/loads\/needs-driver-bill-remint"/.test(routesSrc)) {
    errs.push(`${ROUTES_FILE}: the list route (GET .../needs-driver-bill-remint) is missing`);
  }
  if (!/"\/api\/v1\/mdata\/loads\/remint-driver-bill\/apply-all"/.test(routesSrc)) {
    errs.push(`${ROUTES_FILE}: the bulk apply route (POST .../remint-driver-bill/apply-all) is missing`);
  }
  const applyAllBlockMatch = routesSrc.match(/"\/api\/v1\/mdata\/loads\/remint-driver-bill\/apply-all"[\s\S]*?\n {2}\);/);
  const applyAllBlock = applyAllBlockMatch ? applyAllBlockMatch[0] : routesSrc;
  if (!/REMINT_ROLES\.has\(authUser\.role\)/.test(applyAllBlock)) {
    errs.push(`${ROUTES_FILE}: apply-all must be gated by the SAME REMINT_ROLES the single-load remint route uses, not a separate role set`);
  }
  if (!/ensureDriverBillArtifactsForLoad\(client, \{/.test(applyAllBlock)) {
    errs.push(`${ROUTES_FILE}: apply-all must reuse ensureDriverBillArtifactsForLoad per load — no new mint logic invented for the bulk path`);
  }
  if (!/appendCrudAudit\(/.test(applyAllBlock) || !/driver_bill_remint_all_attempted/.test(applyAllBlock)) {
    errs.push(`${ROUTES_FILE}: apply-all must write its own top-level audit event with the full per-load outcome list`);
  }

  if (!screenSrc) errs.push(`${SCREEN_FILE}: missing`);
  else {
    if (!/listLoadsNeedingDriverBillRemint/.test(screenSrc)) {
      errs.push(`${SCREEN_FILE}: must call the list API, not hand-roll a query`);
    }
    if (!/window\.prompt/.test(screenSrc)) {
      errs.push(`${SCREEN_FILE}: reason must be required (typed prompt), matching every other void/remint action in this app`);
    }
  }

  if (!manifestSrc || !/path="\/dispatch\/driver-bill-remint"/.test(manifestSrc)) {
    errs.push(`${MANIFEST_FILE}: the screen route must be registered — an unregistered page is unreachable`);
  }

  // A mounted route with zero inbound links is its own known bug class in this codebase (SAF-F22
  // precedent: six safety tabs sat mounted-but-unlinked). Require a real link, not just a route.
  if (!overviewSrc || !/\/dispatch\/driver-bill-remint/.test(overviewSrc)) {
    errs.push(`${OVERVIEW_FILE}: the screen has no inbound link from Dispatch Overview — a mounted route with zero inbound links is unreachable in practice`);
  }

  return errs;
}

function selftest() {
  const goodRoutes = read(ROUTES_FILE) ?? "";
  const goodScreen = read(SCREEN_FILE) ?? "";
  const goodManifest = read(MANIFEST_FILE) ?? "";
  const goodOverview = read(OVERVIEW_FILE) ?? "";
  const goodErrs = assertGuard(goodRoutes, goodScreen, goodManifest, goodOverview);
  if (goodErrs.length) {
    console.error(`${LABEL} --selftest FAIL good (${goodErrs.length}): ${goodErrs.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    ["bad1-no-list-route", assertGuard(goodRoutes.replace(/"\/api\/v1\/mdata\/loads\/needs-driver-bill-remint"/g, "REMOVED"), goodScreen, goodManifest, goodOverview)],
    ["bad2-no-apply-all-route", assertGuard(goodRoutes.replace(/"\/api\/v1\/mdata\/loads\/remint-driver-bill\/apply-all"/g, "REMOVED"), goodScreen, goodManifest, goodOverview)],
    ["bad3-no-role-gate", assertGuard(goodRoutes.replace(/REMINT_ROLES\.has\(authUser\.role\)/g, "true"), goodScreen, goodManifest, goodOverview)],
    ["bad4-not-reused", assertGuard(goodRoutes.replace(/ensureDriverBillArtifactsForLoad\(client, \{/g, "ensureDriverBillArtifactsForLoadXXX(client, {"), goodScreen, goodManifest, goodOverview)],
    ["bad5-no-audit", assertGuard(goodRoutes.replace(/driver_bill_remint_all_attempted/g, "REMOVED"), goodScreen, goodManifest, goodOverview)],
    ["bad6-no-reason-prompt", assertGuard(goodRoutes, goodScreen.replace(/window\.prompt/g, "REMOVED"), goodManifest, goodOverview)],
    ["bad7-not-registered", assertGuard(goodRoutes, goodScreen, goodManifest.replace(/path="\/dispatch\/driver-bill-remint"/g, "REMOVED"), goodOverview)],
    ["bad8-orphan-route-no-link", assertGuard(goodRoutes, goodScreen, goodManifest, goodOverview.replace(/\/dispatch\/driver-bill-remint/g, "REMOVED"))],
  ];

  for (const [name, res] of mutations) {
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS ${mutations.length}/${mutations.length} mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errs = assertGuard(read(ROUTES_FILE), read(SCREEN_FILE), read(MANIFEST_FILE), read(OVERVIEW_FILE));
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — the driver-bill remint screen exists, is role-gated, reuses the shared mint, is registered, and is reachable from Dispatch Overview`);
