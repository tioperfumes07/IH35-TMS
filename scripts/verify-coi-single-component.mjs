#!/usr/bin/env node
/**
 * 0441-mod9-coi-duplicated-feature-unequal
 *
 * Customers list + CustomerDetail must mount the SAME shared CoiTab component
 * (via thin wrappers). Fails if either wrapper still carries a divergent
 * implementation or imports a differently-named COI component.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify:coi-single-component";

const paths = {
  shared: path.join(ROOT, "apps/frontend/src/pages/customers/CoiTab.tsx"),
  listPreview: path.join(ROOT, "apps/frontend/src/pages/customers/CustomerCOITab.tsx"),
  fullPage: path.join(ROOT, "apps/frontend/src/pages/customers/tabs/CoiRequestsTab.tsx"),
  customersPage: path.join(ROOT, "apps/frontend/src/pages/Customers.tsx"),
  customerDetail: path.join(ROOT, "apps/frontend/src/pages/CustomerDetail.tsx"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

/** @param {{ shared: string; listPreview: string; fullPage: string; customersPage: string; customerDetail: string }} sources */
export function collectFailures(sources) {
  const failures = [];

  if (!/export function CoiTab\b/.test(sources.shared)) {
    failures.push("CoiTab.tsx must export function CoiTab");
  }
  if (!/variant:\s*CoiTabVariant|"list-preview"|"full-page"/.test(sources.shared)) {
    failures.push("CoiTab.tsx must be parameterized by list-preview vs full-page variant");
  }
  if (!sources.shared.includes("+ Create COI") || !sources.shared.includes("+ Create")) {
    failures.push("CoiTab.tsx must keep + Create COI / + Create vocabulary");
  }

  const importRe = /import\s*\{[^}]*\bCoiTab\b[^}]*\}\s*from\s*["']([^"']+)["']/;
  const listMatch = sources.listPreview.match(importRe);
  const fullMatch = sources.fullPage.match(importRe);
  if (!listMatch) {
    failures.push("CustomerCOITab.tsx must import { CoiTab } from the shared module");
  }
  if (!fullMatch) {
    failures.push("CoiRequestsTab.tsx must import { CoiTab } from the shared module");
  }
  if (listMatch && fullMatch) {
    const listResolved = path.normalize(path.join(path.dirname(paths.listPreview), listMatch[1]));
    const fullResolved = path.normalize(path.join(path.dirname(paths.fullPage), fullMatch[1]));
    const sharedResolved = path.normalize(paths.shared.replace(/\.tsx$/, ""));
    if (listResolved !== fullResolved) {
      failures.push(
        `wrappers import differently-named/located COI modules: ${listMatch[1]} vs ${fullMatch[1]}`
      );
    }
    if (listResolved !== sharedResolved && `${listResolved}.tsx` !== paths.shared) {
      failures.push(`CustomerCOITab must import shared CoiTab.tsx (got ${listMatch[1]})`);
    }
    if (fullResolved !== sharedResolved && `${fullResolved}.tsx` !== paths.shared) {
      failures.push(`CoiRequestsTab must import shared CoiTab.tsx (got ${fullMatch[1]})`);
    }
  }

  // Thin wrappers: no local ParityTable / createInsuranceCoiRequest / listInsuranceCoiRequests
  for (const [name, src] of [
    ["CustomerCOITab.tsx", sources.listPreview],
    ["CoiRequestsTab.tsx", sources.fullPage],
  ]) {
    if (/ParityTable|createInsuranceCoiRequest|listInsuranceCoiRequests|listCoiRequests|createCoiRequest/.test(src)) {
      failures.push(`${name} must be a thin wrapper — must not re-implement COI query/table logic`);
    }
    if (!/variant=["']list-preview["']/.test(src) && name === "CustomerCOITab.tsx") {
      failures.push('CustomerCOITab must mount <CoiTab variant="list-preview" />');
    }
    if (!/variant=["']full-page["']/.test(src) && name === "CoiRequestsTab.tsx") {
      failures.push('CoiRequestsTab must mount <CoiTab variant="full-page" />');
    }
  }

  // Both mount points stay (additive)
  if (!/CustomerCOITab/.test(sources.customersPage)) {
    failures.push("Customers.tsx must keep CustomerCOITab mount point");
  }
  if (!/CoiRequestsTab/.test(sources.customerDetail)) {
    failures.push("CustomerDetail.tsx must keep CoiRequestsTab mount point");
  }

  return failures;
}

function selftest() {
  const live = {
    shared: read(paths.shared),
    listPreview: read(paths.listPreview),
    fullPage: read(paths.fullPage),
    customersPage: read(paths.customersPage),
    customerDetail: read(paths.customerDetail),
  };
  const good = collectFailures(live);
  if (good.length) {
    console.error(`${LABEL} SELFTEST FAIL — live sources should pass:`);
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const planted = collectFailures({
    ...live,
    listPreview: `import { OtherCoi } from "./OtherCoi";\nexport function CustomerCOITab(p){return <OtherCoi {...p}/>}`,
  });
  if (
    !planted.some(
      (f) =>
        /import \{ CoiTab \}/.test(f) ||
        /differently-named/.test(f) ||
        /thin wrapper/.test(f) ||
        /list-preview/.test(f)
    )
  ) {
    console.error(`${LABEL} SELFTEST FAIL — did not detect planted divergent wrapper`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

function main() {
  const failures = collectFailures({
    shared: read(paths.shared),
    listPreview: read(paths.listPreview),
    fullPage: read(paths.fullPage),
    customersPage: read(paths.customersPage),
    customerDetail: read(paths.customerDetail),
  });

  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`${LABEL} OK — both COI mounts share CoiTab (list-preview + full-page)`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else main();
}
