#!/usr/bin/env node
/** DISP-S08 — /dispatch/border-crossing wizard entity-scoped + honest empty. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-disp-s08-border-crossing-surface";
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx";
const API = "apps/frontend/src/components/border-crossing/borderCrossingApi.ts";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

function assertLive(over = {}) {
  const problems = [];
  const page = (over[PAGE] ?? fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
  const api = (over[API] ?? fs.readFileSync(path.join(ROOT, API), "utf8"));
  const manifest = (over[MANIFEST] ?? fs.readFileSync(path.join(ROOT, MANIFEST), "utf8"));
  if (!/path="\/dispatch\/border-crossing"/.test(manifest) || !/BorderCrossingWizardPage/.test(manifest)) {
    problems.push("manifest missing /dispatch/border-crossing → BorderCrossingWizardPage");
  }
  if (!/useCompanyContext/.test(page) || !/selectedCompanyId/.test(page)) {
    problems.push("page not company-context scoped");
  }
  // 0b6d911e11 (DSP-F7115 snapshot border wizard scope, #17134): the submit snapshots selectedCompanyId into
  // input.companyId and sends that — same rule (the POST carries the selected operating company).
  const directScope = /operating_company_id:\s*selectedCompanyId/.test(page);
  const snapshotScope = /companyId:\s*selectedCompanyId/.test(page) && /operating_company_id:\s*input\.companyId/.test(page);
  if (!directScope && !snapshotScope) {
    problems.push("submit missing operating_company_id");
  }
  if (!/fetchCustomsBrokers\(operatingCompanyId\)/.test(api)) {
    problems.push("brokers fetch not entity-scoped");
  }
  if (!/portsError|setPortsError/.test(api) || !/brokersError|setBrokersError/.test(api)) {
    problems.push("API hook swallows errors without surfacing");
  }
  if (!/data-testid="border-crossing-need-company"/.test(page)) {
    problems.push("missing need-company honest empty");
  }
  if (!/data-testid="border-crossing-ports-honest-empty"/.test(page)) {
    problems.push("missing ports honest empty");
  }
  if (!/ListErrorBanner/.test(page)) problems.push("missing ListErrorBanner");
  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const orig = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const plantedPage = orig.replace(/data-testid="border-crossing-ports-honest-empty"/, 'data-testid="x"');
  {
    const planted = assertLive({ [PAGE]: plantedPage });
    if (!planted.length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
  }
  {
    const planted = assertLive({ [PAGE]: orig.replace("operating_company_id: input.companyId", "operating_company_id: undefined") });
    if (!planted.some((x) => x.includes("operating_company_id"))) {
      console.error(`${LABEL} SELFTEST FAILED: unscoped submit not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
