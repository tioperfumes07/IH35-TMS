#!/usr/bin/env node
/**
 * Form 425C URL-tab + filing-entity identity ratchet.
 * Form 425C is per filing entity, never a cross-entity default pair.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-tabs-url-sync";
const FILES = {
  home: "apps/frontend/src/pages/form425c/Form425CHome.tsx",
  profiles: "apps/frontend/src/pages/form425c/tabs/ProfilesTab.tsx",
  form: "apps/frontend/src/pages/form425c/tabs/CurrentPeriodTab.tsx",
  qb: "apps/frontend/src/pages/form425c/tabs/QBImportTab.tsx",
  routes: "apps/backend/src/compliance/form-425c.routes.ts",
  pdf: "apps/backend/src/compliance/form-425c-pdf.ts",
};

function readSources() {
  return Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
}

export function collectProblems(source = readSources()) {
  const problems = [];
  for (const needle of ["useSearchParams", 'searchParams.get("tab")', "parseForm425CTab", 'params.set("tab", next)']) {
    if (!source.home.includes(needle)) problems.push(`home missing ${JSON.stringify(needle)}`);
  }
  if (source.home.includes('useState<TabId>("profile")')) problems.push("home uses local-only tab state");

  if (!source.routes.includes("async function filingProfileIdentity(")) problems.push("backend lacks canonical filing-profile identity resolver");
  if (!source.routes.includes("FROM org.companies")) problems.push("backend filing identity is not derived from org.companies");
  if (!source.routes.includes('companyKey: row.code === "TRK" ? "trucking" : "transportation"')) problems.push("backend does not map the selected operating company to one legacy storage key");
  if (!source.routes.includes("async function ensureDefaultProfile(")) problems.push("backend lacks singular filing-profile initializer");
  if (source.routes.includes("async function ensureDefaultProfiles(")) problems.push("backend regressed to plural cross-entity profile seeding");
  if (source.routes.includes("const rows = [") && source.routes.includes('company_key: "trucking"') && source.routes.includes('company_key: "transportation"')) problems.push("backend seeds both legal entities into every company");
  if (!/WHERE operating_company_id = \$1::uuid\s+AND company_key = \$2\s+LIMIT 1/.test(source.routes)) problems.push("profile read does not restrict to the selected filing entity key");
  if (!source.routes.includes("b.company_key !== identity.companyKey")) problems.push("profile write does not reject a cross-entity key");
  if (!source.routes.includes('error: "form_425c_profile_company_key_mismatch"')) problems.push("profile key mismatch does not fail explicitly");

  if (!source.home.includes("profilesQuery.data.profiles[0]?.company_key")) problems.push("home does not select the returned filing profile");
  if (!source.home.includes("availableCompanies={availableCompanies}")) problems.push("home does not pass the scoped profile set to the tab");
  if (!source.home.includes('{profiles[activeCompany].name || "Form 425C"}')) problems.push("home header is not filing-entity aware");
  if (source.home.includes(">IH 35 GROUP<")) problems.push("home regressed to a hardcoded cross-entity group heading");
  if (!source.profiles.includes("availableCompanies.map((k)")) problems.push("profiles tab does not render only scoped filing profiles");
  if (source.profiles.includes('(["trucking", "transportation"] as const).map')) problems.push("profiles tab regressed to both hardcoded entities");
  if (!source.form.includes("availableCompanies.map((k)")) problems.push("form tab does not render only scoped filing profiles");
  if (source.form.includes('<option value="trucking">') || source.form.includes('<option value="transportation">')) {
    problems.push("form tab hardcoded both debtor options — Save Defaults 400s form_425c_profile_company_key_mismatch on the foreign key");
  }
  if (!source.qb.includes("availableCompanies.map((k)")) problems.push("deposit import tab does not render only scoped filing profiles");
  if (source.qb.includes('<option value="trucking">') || source.qb.includes('<option value="transportation">')) {
    problems.push("deposit import tab hardcoded both debtor options — picking the sibling key is a silent/400 foreign debtor");
  }
  if ((source.home.match(/availableCompanies=\{availableCompanies\}/g) ?? []).length < 3) {
    problems.push("home must pass availableCompanies to Profiles, Form, and Deposit Import tabs");
  }

  if (!source.pdf.includes("JOIN org.companies c ON c.id = p.operating_company_id")) problems.push("PDF profile lookup does not resolve the selected filing entity");
  if (!source.pdf.includes("p.company_key = CASE WHEN c.code = 'TRK' THEN 'trucking' ELSE 'transportation' END")) problems.push("PDF lookup can select a sibling legacy profile");
  return problems;
}

function run() {
  const problems = collectProblems();
  if (problems.length) throw new Error(`${LABEL}:\n  - ${problems.join("\n  - ")}`);
  console.log(`${LABEL}: PASS`);
}

function selftest() {
  const real = readSources();
  const cases = [
    ["org-company source", "routes", "FROM org.companies", "FROM catalogs.form_425c_company_profiles"],
    ["singular initializer", "routes", "async function ensureDefaultProfile(", "async function ensureDefaultProfiles("],
    ["scoped read key", "routes", "AND company_key = $2", "AND company_key IS NOT NULL"],
    ["write key ownership", "routes", "b.company_key !== identity.companyKey", "false"],
    ["returned-profile selection", "home", "profilesQuery.data.profiles[0]?.company_key", '"trucking"'],
    ["dynamic heading", "home", '{profiles[activeCompany].name || "Form 425C"}', "IH 35 GROUP"],
    ["scoped profile tabs", "profiles", "availableCompanies.map((k)", '(["trucking", "transportation"] as const).map((k)'],
    ["form scoped debtor", "form", "availableCompanies.map((k)", '<option value="trucking">'],
    ["qb scoped debtor", "qb", "availableCompanies.map((k)", '<option value="transportation">'],
    ["PDF selected entity", "pdf", "JOIN org.companies c ON c.id = p.operating_company_id", ""],
  ];
  for (const [name, file, before, after] of cases) {
    if (!real[file].includes(before)) throw new Error(`${LABEL}: inert selftest mutation ${name}`);
    const mutated = { ...real, [file]: real[file].replace(before, after) };
    if (collectProblems(mutated).length === 0) throw new Error(`${LABEL}: planted defect escaped: ${name}`);
  }
  if (collectProblems(real).length !== 0) throw new Error(`${LABEL}: corrected source fails its own assertions`);
  console.log(`${LABEL}: selftest PASS (${cases.length}/${cases.length})`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
