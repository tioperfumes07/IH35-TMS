#!/usr/bin/env node
/**
 * verify-425c-petition-not-hardcoded.mjs  (audit gap #17 — 425C hardcoded petition_date)
 *
 * Root cause: Form425CHome.tsx create payload shipped `petition_date: "2025-02-03"` hardcoded —
 * active Ch.11 court-filing legal exposure (wrong petition date on a UST Form 425C submission).
 * Fixed on main (PR #2563): create resolves the date via resolveCreatePetitionDate() from the
 * Profiles & Defaults entry / case SoR — never a literal. This guard makes the regression
 * impossible to re-ship:
 *   1. No file under apps/frontend/src/pages/form425c (non-test) may assign an ISO-date string
 *      literal to petition_date / petitionDate.
 *   2. Form425CHome.tsx must still import AND call resolveCreatePetitionDate for the create payload.
 *   3. The backend create route (form-425c.routes.ts) may not hardcode a petition_date literal.
 *
 * Usage:
 *   node scripts/verify-425c-petition-not-hardcoded.mjs            # scan
 *   node scripts/verify-425c-petition-not-hardcoded.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FRONTEND_DIR = "apps/frontend/src/pages/form425c";
const HOME_FILE = "apps/frontend/src/pages/form425c/Form425CHome.tsx";
const BACKEND_ROUTE = "apps/backend/src/compliance/form-425c.routes.ts";

// petition_date: "2025-02-03" | petitionDate = '2026-01-01' | petition_date: `2025-02-03`
const HARDCODE_RE = /petition_?[dD]ate\s*[:=]\s*["'`]\d{4}-\d{2}-\d{2}["'`]/;

function listSourceFiles(dirAbs) {
  const out = [];
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      out.push(...listSourceFiles(abs));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

export function checkNoHardcodedLiteral(rel, src) {
  const offenders = [];
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    if (HARDCODE_RE.test(line)) {
      offenders.push(`${rel}:${i + 1}: hardcoded petition date literal — court filing risk: ${line.trim()}`);
    }
  });
  return offenders;
}

export function checkHomeUsesResolver(src) {
  const offenders = [];
  if (!/import\s*\{[^}]*resolveCreatePetitionDate[^}]*\}\s*from\s*["']\.\/lib\/petitionDate["']/.test(src)) {
    offenders.push(`${HOME_FILE}: must import resolveCreatePetitionDate from ./lib/petitionDate`);
  }
  if (!/resolveCreatePetitionDate\s*\(/.test(src)) {
    offenders.push(`${HOME_FILE}: create path must call resolveCreatePetitionDate() — never compose petition_date itself`);
  }
  return offenders;
}

/** Profiles Save must persist petition_date. Hardcoding petitionDate: "" on GET hydrate wipes Save Defaults. */
export function checkProfilePersistsPetitionDate(homeSrc, routeSrc) {
  const offenders = [];
  if (/merged\[row\.company_key\]\s*=\s*\{[^}]*petitionDate:\s*""/s.test(homeSrc)) {
    offenders.push(`${HOME_FILE}: profile hydrate must read row.petition_date — never petitionDate: ""`);
  }
  if (!/row\.petition_date/.test(homeSrc)) {
    offenders.push(`${HOME_FILE}: profile hydrate must map row.petition_date`);
  }
  if (!/petition_date:\s*\/\^\\d\{4\}/.test(homeSrc) && !/petition_date:/.test(homeSrc)) {
    offenders.push(`${HOME_FILE}: Save Defaults upsert must send petition_date`);
  }
  if (!/INSERT INTO catalogs\.form_425c_company_profiles[\s\S]*petition_date/i.test(routeSrc)) {
    offenders.push(`${BACKEND_ROUTE}: profile upsert INSERT must include petition_date`);
  }
  return offenders;
}

export function run() {
  const offenders = [];
  for (const abs of listSourceFiles(path.join(repoRoot, FRONTEND_DIR))) {
    const rel = path.relative(repoRoot, abs);
    offenders.push(...checkNoHardcodedLiteral(rel, fs.readFileSync(abs, "utf8")));
  }
  const homeSrc = fs.readFileSync(path.join(repoRoot, HOME_FILE), "utf8");
  const routeSrc = fs.readFileSync(path.join(repoRoot, BACKEND_ROUTE), "utf8");
  offenders.push(...checkHomeUsesResolver(homeSrc));
  offenders.push(...checkNoHardcodedLiteral(BACKEND_ROUTE, routeSrc));
  offenders.push(...checkProfilePersistsPetitionDate(homeSrc, routeSrc));
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const badCreate = 'createForm425CReport(companyId, { petition_date: "2025-02-03", subchapter: "V" })';
  const badAssign = "const petitionDate = '2026-01-01';";
  const goodCreate = "const petitionDate = resolveCreatePetitionDate(profiles[activeCompany].petitionDate);\npetition_date: petitionDate,";
  const goodHome =
    'import { casePetitionDateFromReports, resolveCreatePetitionDate } from "./lib/petitionDate";\n' +
    "const petitionDate = resolveCreatePetitionDate(profiles[activeCompany].petitionDate);";
  const badHome = 'petition_date: "2025-02-03",';

  const badCreateFails = checkNoHardcodedLiteral("x.tsx", badCreate).length > 0;
  const badAssignFails = checkNoHardcodedLiteral("x.tsx", badAssign).length > 0;
  const goodCreatePasses = checkNoHardcodedLiteral("x.tsx", goodCreate).length === 0;
  const goodHomePasses = checkHomeUsesResolver(goodHome).length === 0;
  const badHomeFails = checkHomeUsesResolver(badHome).length > 0;
  const wipeHydrate =
    'merged[row.company_key] = {\n          name: row.company_name,\n          petitionDate: "",\n        };';
  const persistHydrate =
    'merged[row.company_key] = {\n          petitionDate: String(row.petition_date ?? "").slice(0, 10),\n        };\n        petition_date: profiles[activeCompany].petitionDate,';
  const persistInsert = "INSERT INTO catalogs.form_425c_company_profiles (\n            petition_date,\n          )";
  const wipeFails = checkProfilePersistsPetitionDate(wipeHydrate, "INSERT INTO catalogs.form_425c_company_profiles (company_name)").length > 0;
  const persistPasses = checkProfilePersistsPetitionDate(persistHydrate, persistInsert).length === 0;

  if (badCreateFails && badAssignFails && goodCreatePasses && goodHomePasses && badHomeFails && wipeFails && persistPasses) {
    console.log("verify:425c-petition-not-hardcoded selftest OK");
    process.exit(0);
  }
  console.error("verify:425c-petition-not-hardcoded selftest FAILED", {
    badCreateFails, badAssignFails, goodCreatePasses, goodHomePasses, badHomeFails, wipeFails, persistPasses,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:425c-petition-not-hardcoded FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:425c-petition-not-hardcoded OK — 425C create never hardcodes petition_date");
}
