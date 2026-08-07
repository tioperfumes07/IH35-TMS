#!/usr/bin/env node
/**
 * FACT-kpi-vs-profile + FACT-dup-selfmatch
 *
 * KPI summary exposes vendor linkage id + factoring.factor profile id from the same
 * canonical agreement gate. FactoringHome resolves the profile panel via profile id
 * (not vendor id / vendor notes). Duplicate-vendor scan emits one directed pair only
 * (a.id < b.id) — no symmetric "Faro ↔ Faro" self-match rows.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fact-profile-canonical-factor";

const ROUTES = "apps/backend/src/factoring/factoring.routes.ts";
const SCAN = "apps/backend/src/factoring/scan-duplicate-vendors.routes.ts";
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const HELPER = "apps/frontend/src/lib/factorProfile.ts";
const API = "apps/frontend/src/api/factoring.ts";
const BANNER = "apps/frontend/src/components/factoring/DuplicateVendorsBanner.tsx";

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`missing ${rel}`);
  }
  return fs.readFileSync(full, "utf8");
}

export function collectProblems(sources = {
  routes: read(ROUTES),
  scan: read(SCAN),
  home: read(HOME),
  helper: read(HELPER),
  api: read(API),
  banner: read(BANNER),
}) {
  const problems = [];
  const { routes, scan, home, helper, api, banner } = sources;

  if (!/active_factor_profile_id/.test(routes)) {
    problems.push(`${ROUTES}: summary must expose active_factor_profile_id`);
  }
  if (!/profile_id:\s*identity\.factorProfileId/.test(routes)) {
    problems.push(`${ROUTES}: resolveActiveFactor must map factorProfileId → profile_id`);
  }
  if (!/withCanonicalFactorIdentity/.test(routes)) {
    problems.push(`${ROUTES}: summary/settings must merge canonical profile id onto payload`);
  }

  if (!/a\.id < b\.id/.test(scan)) {
    problems.push(`${SCAN}: must dedupe symmetric pairs with a.id < b.id (FACT-dup-selfmatch)`);
  }
  if (/b\.id <> a\.id/.test(scan)) {
    problems.push(`${SCAN}: must not use b.id <> a.id without canonical ordering (symmetric dup pairs)`);
  }

  if (!/active_factor_profile_id/.test(api)) {
    problems.push(`${API}: FactoringSummary must include active_factor_profile_id`);
  }
  if (!/resolveActiveFactorFromSummary/.test(home)) {
    problems.push(`${HOME}: must resolve profile via resolveActiveFactorFromSummary`);
  }
  if (!/resolveActiveFactorFromSummary/.test(helper)) {
    problems.push(`${HELPER}: missing resolveActiveFactorFromSummary helper`);
  }
  if (!/active_factor_profile_id/.test(helper)) {
    problems.push(`${HELPER}: resolver must prefer active_factor_profile_id`);
  }
  if (/parseVendorNotes|activeFactorVendor/.test(home)) {
    problems.push(`${HOME}: must not use vendor-notes dual-path for factor profile`);
  }

  if (!/from_vendor_id !== p\.to_vendor_id/.test(banner)) {
    problems.push(`${BANNER}: must filter self-match pairs client-side`);
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = {
    routes: read(ROUTES),
    scan: read(SCAN),
    home: read(HOME),
    helper: read(HELPER),
    api: read(API),
    banner: read(BANNER),
  };
  const broken = {
    ...real,
    routes: real.routes.replace(/active_factor_profile_id/g, "REMOVED_PROFILE_ID"),
    scan: real.scan.replace("a.id < b.id", "b.id <> a.id"),
    home: real.home.replace("resolveActiveFactorFromSummary", "legacyVendorNotesResolver"),
  };
  if (collectProblems(broken).length === 0) {
    console.error(`[${LABEL}] --selftest FAIL: broken fixture not flagged`);
    process.exit(1);
  }
  const good = collectProblems(real);
  if (good.length) {
    console.error(`[${LABEL}] --selftest FAIL:\n${good.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  try {
    const problems = collectProblems();
    if (problems.length) {
      console.error(`[${LABEL}] FAIL:`);
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`[${LABEL}] PASS — KPI + profile share factoring.factor; dedup scan ordered`);
  } catch (err) {
    console.error(`[${LABEL}] FAIL: ${err.message}`);
    process.exit(1);
  }
}
