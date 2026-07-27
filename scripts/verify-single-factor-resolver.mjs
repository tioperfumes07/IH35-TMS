#!/usr/bin/env node
/**
 * FACT-03 — single canonical Faro factor identity (CPA VETO: no customer-majority inference).
 *
 * FAILS when any backend route resolves factor identity via
 *   GROUP BY factoring_company_vendor_id … ORDER BY COUNT(*) DESC
 * or when factoring.routes.ts does not call resolveCanonicalActiveFactor /
 * resolveFaroFactorIdentity (same gate as factoring-balance-invoice-linkage + GL poster).
 *
 * Usage:
 *   node scripts/verify-single-factor-resolver.mjs
 *   node scripts/verify-single-factor-resolver.mjs --selftest
 *
 * Rule 17: do NOT edit package.json / locked-guards.yml / ci.yml.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runExecutableGuard } from "./guard-executable-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-single-factor-resolver";
const FACTORING_ROUTES = "apps/backend/src/factoring/factoring.routes.ts";

const MAJORITY_INFERENCE_RE =
  /GROUP\s+BY\s+factoring_company_vendor_id[\s\S]{0,800}ORDER\s+BY\s+COUNT\s*\(\s*\*\s*\)\s+DESC/i;
const MAJORITY_ORDER_ONLY_RE = /ORDER\s+BY\s+COUNT\s*\(\s*\*\s*\)\s+DESC/i;

function walkRouteFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "dist") continue;
      walkRouteFiles(full, out);
      continue;
    }
    if (!entry.name.endsWith(".routes.ts")) continue;
    out.push(full);
  }
  return out;
}

function readRel(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

export function checker(sources) {
  const failures = [];

  const factoringRoutes = sources.factoringRoutes;
  if (!factoringRoutes) {
    failures.push(`missing_file:${FACTORING_ROUTES}`);
    return failures;
  }

  if (!/\bresolveCanonicalActiveFactor\b/.test(factoringRoutes) && !/\bresolveFaroFactorIdentity\b/.test(factoringRoutes)) {
    failures.push("factoring_routes_must_use_canonical_active_factor_resolver");
  }
  if (MAJORITY_INFERENCE_RE.test(factoringRoutes)) {
    failures.push("factoring_routes_customer_majority_inference_forbidden");
  }

  for (const [key, rel] of Object.entries(sources.routeFiles ?? {})) {
    const src = sources[key];
    if (!src) {
      failures.push(`missing_file:${rel}`);
      continue;
    }
    if (MAJORITY_INFERENCE_RE.test(src)) {
      failures.push(`route_customer_majority_inference:${rel}`);
    } else if (/factoring_company_vendor_id/i.test(src) && MAJORITY_ORDER_ONLY_RE.test(src)) {
      failures.push(`route_count_majority_on_factoring_vendor:${rel}`);
    }
  }

  return failures;
}

export function loadRepositoryFixture() {
  const routeDir = path.join(ROOT, "apps/backend/src");
  const routePaths = walkRouteFiles(routeDir);
  const routeFiles = {};
  const sources = {
    factoringRoutes: readRel(FACTORING_ROUTES),
    routeFiles: {},
  };
  for (const abs of routePaths) {
    const rel = path.relative(ROOT, abs);
    const key = `route:${rel}`;
    routeFiles[key] = rel;
    sources.routeFiles[key] = rel;
    sources[key] = fs.readFileSync(abs, "utf8");
  }
  return sources;
}

export function createBadFixture(good) {
  const bad = structuredClone(good);
  bad.factoringRoutes =
    String(good.factoringRoutes ?? "") +
    `
        SELECT factoring_company_vendor_id AS vendor_id, COUNT(*)::int AS customer_count
          FROM mdata.customers
         WHERE operating_company_id = $1
           AND factoring_company_vendor_id IS NOT NULL
         GROUP BY factoring_company_vendor_id
         ORDER BY COUNT(*) DESC
         LIMIT 1
    `.replace(/resolveCanonicalActiveFactor/g, "resolveSomethingElse");
  return bad;
}

if (import.meta.url === fileURLToPath(import.meta.url)) {
  const goodFixture = loadRepositoryFixture();
  runExecutableGuard({
    label: LABEL,
    checker,
    loadRepositoryFixture,
    goodFixture,
    badFixture: createBadFixture(goodFixture),
    expectedBadViolationSubstrings: ["factoring_routes_customer_majority_inference_forbidden"],
  });
}
