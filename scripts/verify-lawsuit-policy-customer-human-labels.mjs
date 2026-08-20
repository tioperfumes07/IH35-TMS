#!/usr/bin/env node
/** LST-F124 — LawsuitsTab + PolicyDetail + Customers source_load: no UUID-slice chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/insurance/LawsuitsTab.tsx",
  "apps/frontend/src/pages/insurance/PolicyDetail.tsx",
  "apps/frontend/src/pages/Customers.tsx",
];
const LABEL = "verify-lawsuit-policy-customer-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (/claim_id\.slice\(0,\s*8\)/.test(src) || /unitId\.slice\(0,\s*8\)/.test(src) || /source_load_id\.slice\(0,\s*8\)/.test(src)) {
      problems.push(`${file}: still UUID-slices`);
    }
    const usesGovernedLabel = /entityLabel\(/.test(src) || /<EntityLinkOrTombstone\b/.test(src);
    if (!usesGovernedLabel) {
      problems.push(`${file}: missing entityLabel`);
    }
  }
  const lawsuits = srcs[FILES[0]];
  const policy = srcs[FILES[1]];
  const customers = srcs[FILES[2]];
  const lawsuitTombstoneLink = (kind, id, name, noun) => new RegExp(`<EntityLinkOrTombstone\\s+kind="${kind}"\\s+id=\\{lawsuit\\.${id}\\}\\s+name=\\{lawsuit\\.${name}\\}\\s+noun="${noun}"`);
  if (!lawsuitTombstoneLink("claim", "claim_id", "claim_number", "Claim").test(lawsuits)) problems.push(`${FILES[0]}: lawsuit claim drill must consume claim_number through tombstone-safe binding`);
  if (!lawsuitTombstoneLink("driver", "driver_id", "driver_name", "Driver").test(lawsuits)) problems.push(`${FILES[0]}: lawsuit driver drill must consume driver_name through tombstone-safe binding`);
  if (!lawsuitTombstoneLink("unit", "unit_id", "unit_number", "Unit").test(lawsuits)) problems.push(`${FILES[0]}: lawsuit unit drill must consume unit_number through tombstone-safe binding`);
  if (!/entityLabel\(unit\.unit_number,\s*unitId,\s*"Unit"\)/.test(policy)) problems.push(`${FILES[1]}: policy unit link must consume unit_number`);
  const directCustomerLoadLabel = /entityLabel\(r\.source_load_number,\s*r\.source_load_id,\s*"Load"\)/.test(customers);
  const tombstoneCustomerLoadLabel = /<EntityLinkOrTombstone[\s\S]{0,180}kind="load"[\s\S]{0,180}id=\{r\.source_load_id\}[\s\S]{0,180}name=\{r\.source_load_number\}[\s\S]{0,180}noun="Load"/.test(customers);
  if (!directCustomerLoadLabel && !tombstoneCustomerLoadLabel) problems.push(`${FILES[2]}: customer transaction link must consume source_load_number`);
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const mutations = [
    [FILES[0], "name={lawsuit.claim_number}", "name={null}"],
    [FILES[0], "name={lawsuit.driver_name}", "name={null}"],
    [FILES[0], "name={lawsuit.unit_number}", "name={null}"],
    [FILES[1], "unit.unit_number", "null"],
    [FILES[2], "r.source_load_number", "null"],
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
