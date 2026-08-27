#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const source = {
  route: fs.readFileSync("apps/backend/src/safety/medical-cards.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/safety.ts", "utf8"),
  section: fs.readFileSync("apps/frontend/src/components/safety/MedicalCardsHistorySection.tsx", "utf8"),
};

function check(s) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(/companyQuerySchema[\s\S]{0,280}limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)[\s\S]{0,100}offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(s.route), "medical-card list must validate bounded range");
  need(/SELECT count\(\*\)::int AS total_count[\s\S]{0,240}FROM safety\.medical_cards mc/.test(s.route), "medical-card list must count identical driver/company scope");
  need(/LIMIT \$\$\{values\.length - 1\} OFFSET \$\$\{values\.length\}/.test(s.route) && /cards: result\.cards, total_count: result\.total_count/.test(s.route), "medical-card list must return page and exact total");
  need(/range: \{ limit\?: number; offset\?: number \}/.test(s.api) && /cards: SafetyMedicalCardRow\[\]; total_count: number/.test(s.api), "medical-card client must type the range contract");
  need(/offset: \(page - 1\) \* pageSize/.test(s.section) && /data-testid="medical-cards-server-pager"/.test(s.section), "both mounted medical-card histories must navigate server pages");
  need(/pageSize=\{pageSize\}[\s\S]{0,100}\bhidePager\b/.test(s.section), "medical-card history must suppress local slice pager");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...source, route: source.route.replaceAll("SELECT count(*)::int AS total_count", "SELECT 0::int AS hidden_count") },
    { ...source, route: source.route.replace(/LIMIT \$\$\{values\.length - 1\} OFFSET \$\$\{values\.length\}/, "LIMIT 500") },
    { ...source, api: source.api.replaceAll("; total_count: number", "") },
    { ...source, section: source.section.replace("offset: (page - 1) * pageSize", "offset: 0") },
    { ...source, section: source.section.replace('data-testid="medical-cards-server-pager"', 'data-testid="removed-pager"') },
    { ...source, section: source.section.replace("hidePager", "showPager") },
  ];
  const escaped = mutations.map((mutation, index) => ({ index, failures: check(mutation) })).filter(({ failures }) => failures.length === 0);
  if (escaped.length) {
    console.error(`FAIL(selftest): escaped mutations ${escaped.map(({ index }) => index + 1).join(", ")}`);
    process.exit(1);
  }
  console.log(`PASS(selftest): ${mutations.length}/${mutations.length} medical-card range mutations detected`);
  process.exit(0);
}

const failures = check(source);
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("PASS: Safety and Driver medical-card histories expose the complete scoped range");
