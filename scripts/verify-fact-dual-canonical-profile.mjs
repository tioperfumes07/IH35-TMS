#!/usr/bin/env node
/**
 * FACT-kpi-vs-profile / VEND-S02 — FactoringHome profile must read/write
 * factoring.factor columns (not vendor notes). VendorDetail must not edit
 * factor rates into notes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fact-dual-canonical-profile";
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const PANEL = "apps/frontend/src/pages/factoring/FactoringProfilePanel.tsx";
const VENDOR = "apps/frontend/src/pages/VendorDetail.tsx";
const HELPER = "apps/frontend/src/lib/factorProfile.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectProblems(sources = {
  home: read(HOME),
  panel: read(PANEL),
  vendor: read(VENDOR),
  helper: read(HELPER),
}) {
  const problems = [];
  const { home, panel, vendor, helper } = sources;

  if (/parseVendorNotes|serializeVendorNotes/.test(home)) {
    problems.push(`${HOME}: must not import/use vendor notes helpers for factor profile`);
  }
  if (!/factorToProfileForm|profileFormToFactorPatch/.test(home)) {
    problems.push(`${HOME}: must map profile via factorProfile helpers`);
  }
  if (!/updateFactor\([\s\S]*advance_rate:/.test(home)) {
    problems.push(`${HOME}: updateFactor must PATCH advance_rate (canonical column)`);
  }
  if (/notes:\s*serializeVendorNotes/.test(home)) {
    problems.push(`${HOME}: must not write profile via notes`);
  }
  if (!/<FactoringProfilePanel[\s\S]*factor=\{activeFactor\}/.test(home)) {
    problems.push(`${HOME}: FactoringProfilePanel must receive factor={activeFactor}`);
  }
  if (/meta=\{factorParsed/.test(home)) {
    problems.push(`${HOME}: must not pass vendor-notes meta to profile panel`);
  }
  if (!/rateToPctString\(factor\.advance_rate\)/.test(panel)) {
    problems.push(`${PANEL}: must display factor.advance_rate`);
  }
  if (!/parseRemittanceDetails/.test(panel)) {
    problems.push(`${PANEL}: must read remittance_details`);
  }
  if (!/emptyFactoringProfileMeta\(\)/.test(vendor)) {
    problems.push(`${VENDOR}: save must strip factoring rates via emptyFactoringProfileMeta()`);
  }
  if (/factoringReservesPct:\s*event\.target\.value/.test(vendor)) {
    problems.push(`${VENDOR}: must not edit factoringReservesPct into vendor notes`);
  }
  if (!/vendor-factor-schedule-relocated/.test(vendor)) {
    problems.push(`${VENDOR}: must show relocated factor schedule notice`);
  }
  if (!/profileFormToFactorPatch/.test(helper) || !/factorToProfileForm/.test(helper)) {
    problems.push(`${HELPER}: missing factor↔form mappers`);
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = {
    home: read(HOME),
    panel: read(PANEL),
    vendor: read(VENDOR),
    helper: read(HELPER),
  };
  const broken = {
    ...real,
    home: `${real.home}\nimport { parseVendorNotes, serializeVendorNotes } from "../../lib/vendorProfileMeta";\n`,
    vendor: real.vendor.replace(/emptyFactoringProfileMeta\(\)/g, "profileForm.factoring"),
  };
  if (collectProblems(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: broken fixture not flagged`);
    process.exit(1);
  }
  const good = collectProblems(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — FactoringHome/VendorDetail use factoring.factor (not vendor notes)`);
}
