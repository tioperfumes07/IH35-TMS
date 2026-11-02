#!/usr/bin/env node
/** LST-F124 — PolicyDetail + Customers source_load: no UUID-slice chrome.
 * ENG-60: insurance LawsuitsTab retired → /legal/lawsuits (legal.matters). Lawsuit human-label
 * chrome is asserted on LegalMattersListPage instead of the Navigate stub.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/insurance/LawsuitsTab.tsx",
  "apps/frontend/src/pages/insurance/PolicyDetail.tsx",
  "apps/frontend/src/pages/Customers.tsx",
  "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx",
];
const LABEL = "verify-lawsuit-policy-customer-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  const lawsuits = srcs[FILES[0]];
  const policy = srcs[FILES[1]];
  const customers = srcs[FILES[2]];
  const legalList = srcs[FILES[3]];

  if (!/Navigate to=\{`\/legal\/lawsuits\$\{search\}`\}/.test(lawsuits)) {
    problems.push(`${FILES[0]}: must Navigate to /legal/lawsuits (ENG-60)`);
  }
  for (const [file, src] of Object.entries({ [FILES[1]]: policy, [FILES[2]]: customers, [FILES[3]]: legalList })) {
    if (/claim_id\.slice\(0,\s*8\)/.test(src) || /unitId\.slice\(0,\s*8\)/.test(src) || /source_load_id\.slice\(0,\s*8\)/.test(src)) {
      problems.push(`${file}: still UUID-slices`);
    }
    const usesGovernedLabel = /entityLabel\(/.test(src) || /<EntityLinkOrTombstone\b/.test(src);
    if (!usesGovernedLabel) problems.push(`${file}: missing entityLabel`);
  }
  if (!/entityLabel\(unit\.unit_number,\s*unitId,\s*"Unit"\)/.test(policy)) {
    problems.push(`${FILES[1]}: policy unit link must consume unit_number`);
  }
  if (!/kind="matter"[\s\S]{0,120}row\.id/.test(policy)) {
    problems.push(`${FILES[1]}: policy lawsuit reverse must drill to legal matter (ENG-60)`);
  }
  const directCustomerLoadLabel = /entityLabel\(r\.source_load_number,\s*r\.source_load_id,\s*"Load"\)/.test(customers);
  const tombstoneCustomerLoadLabel = /<EntityLinkOrTombstone[\s\S]{0,180}kind="load"[\s\S]{0,180}id=\{r\.source_load_id\}[\s\S]{0,180}name=\{r\.source_load_number\}[\s\S]{0,180}noun="Load"/.test(customers);
  if (!directCustomerLoadLabel && !tombstoneCustomerLoadLabel) {
    problems.push(`${FILES[2]}: customer transaction link must consume source_load_number`);
  }
  if (!/entityLabel\(/.test(legalList)) {
    problems.push(`${FILES[3]}: LegalMattersListPage must use entityLabel for matter rows`);
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const mutations = [
    [FILES[0], "/legal/lawsuits", "/insurance/lawsuits"],
    [FILES[1], "unit.unit_number", "null"],
    [FILES[1], 'kind="matter"', 'kind="claim"'],
    [FILES[2], "r.source_load_number", "null"],
    [FILES[3], "entityLabel(", "label("],
  ];
  for (const [file, before, after] of mutations) {
    const planted = { ...srcs, [file]: srcs[file].replace(before, after) };
    if (planted[file] === srcs[file] || !assertAll(planted).length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught in ${file}: ${before}`);
      process.exit(1);
    }
  }
  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} human-label mutations caught`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
