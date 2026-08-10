#!/usr/bin/env node
/**
 * 425-S01/S02 — Form 425C home + exhibits surface ratchet.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

export function run() {
  const errors = [];
  const manifest = read("apps/frontend/src/routes/manifest.tsx");
  const home = read("apps/frontend/src/pages/form425c/Form425CHome.tsx");
  const exhibits = read("apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx");
  const backend = read("apps/backend/src/reports/form-425c/exhibits/routes.ts");

  assert(/path="\/425c"/.test(manifest), "manifest missing /425c route", errors);
  assert(/<Form425CHome\s*\/>/.test(manifest), "manifest /425c must mount Form425CHome", errors);
  assert(/path="\/form-425c"/.test(manifest), "manifest missing /form-425c redirect", errors);
  assert(/<Navigate to="\/425c"/.test(manifest), "manifest /form-425c must redirect to /425c", errors);
  assert(/path="\/425c\/exhibits"/.test(manifest), "manifest missing /425c/exhibits route", errors);
  assert(/<Form425CExhibitsViewer\s*\/>/.test(manifest), "manifest /425c/exhibits must mount Form425CExhibitsViewer", errors);

  assert(home.includes("useCompanyContext"), "Form425CHome must read selectedCompanyId", errors);
  assert(/operating_company_id:\s*companyId/.test(home), "Form425CHome must pass operating_company_id", errors);
  const tabLabels = ["Profiles & Defaults", "QB Import", "Form 425C", "Merge & Export", "History"];
  for (const label of tabLabels) {
    assert(home.includes(label), `Form425CHome missing tab label "${label}"`, errors);
  }
  assert(/createForm425CReport|getForm425CReport|listForm425CReports/.test(home), "Form425CHome must call a 425C report API", errors);

  assert(exhibits.includes("useCompanyContext"), "ExhibitsViewer must read selectedCompanyId", errors);
  assert(/operating_company_id:\s*companyId/.test(exhibits), "ExhibitsViewer must pass operating_company_id to build endpoint", errors);
  for (const letter of ["a", "b", "c", "d", "e", "f"]) {
    assert(exhibits.includes(`letter: "${letter}"`) || exhibits.includes(`letter:'${letter}'`), `ExhibitsViewer missing exhibit ${letter}`, errors);
  }
  assert(/\/api\/v1\/reports\/form-425c\/exhibits\/build/.test(exhibits), "ExhibitsViewer must call exhibits build endpoint", errors);

  assert(backend.includes('app.post("/api/v1/reports/form-425c/exhibits/build"'), "backend missing exhibits build route", errors);
  assert(/withCompanyScope\(user\.uuid,\s*parsed\.data\.operating_company_id/.test(backend), "exhibits build must use withCompanyScope", errors);
  assert(/built\.operating_company_id !== query\.data\.operating_company_id/.test(backend), "exhibits retrieval must scope to operating_company_id", errors);

  return errors;
}

function selftest() {
  const realPath = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");
  const backup = fs.readFileSync(realPath, "utf8");
  try {
    fs.writeFileSync(realPath, backup.replace('path="/425c"', 'path="/425c-old"'), "utf8");
    const planted = run();
    if (!planted.some((e) => e.includes("/425c"))) {
      console.error("[verify-425-s01-s02] SELFTEST FAIL: planted stale /425c route not detected");
      process.exit(1);
    }
    console.log(`[verify-425-s01-s02] SELFTEST PASS (${planted.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(realPath, backup, "utf8");
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    process.exit(0);
  }
  const errors = run();
  if (errors.length) {
    console.error("\n[verify-425-s01-s02] FAILED:\n");
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log("[verify-425-s01-s02] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
