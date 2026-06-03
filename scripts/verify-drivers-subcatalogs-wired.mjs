#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STUB_MARKERS = ["Coming soon", "STUB", "<TableStub />"];

const LIST_PAGES = [
  "apps/frontend/src/pages/lists/driver/LicenseClassesListPage.tsx",
  "apps/frontend/src/pages/lists/driver/CdlEndorsementsListPage.tsx",
  "apps/frontend/src/pages/lists/driver/CdlRestrictionsListPage.tsx",
  "apps/frontend/src/pages/lists/driver/MedicalCardStatusesListPage.tsx",
  "apps/frontend/src/pages/lists/driver/EmploymentStatusesListPage.tsx",
];

const URL_SEGMENTS = [
  "license-classes",
  "endorsements",
  "restrictions",
  "medical-card-status",
  "employment-status",
];

function fail(message) {
  console.error(`verify:drivers-subcatalogs-wired FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

for (const rel of LIST_PAGES) {
  const src = read(rel);
  for (const marker of STUB_MARKERS) {
    if (src.includes(marker)) fail(`${rel} contains stub marker "${marker}"`);
  }
  if (!src.includes("DriverCatalogListPage")) fail(`${rel} must use DriverCatalogListPage`);
}

const driverConfig = read("apps/backend/src/catalogs/driver/subcatalog-config.ts");
const driverIndex = read("apps/backend/src/catalogs/driver/index.ts");
const driverApi = read("apps/frontend/src/api/catalogs-driver.ts");
const manifest = read("apps/frontend/src/routes/manifest.tsx");

for (const segment of URL_SEGMENTS) {
  if (!driverConfig.includes(`urlSegment: "${segment}"`)) {
    fail(`subcatalog config missing urlSegment ${segment}`);
  }
  if (!driverIndex.includes("DRIVER_SUBCATALOG_CONFIGS")) {
    fail("backend index must register DRIVER_SUBCATALOG_CONFIGS");
  }
  if (!driverApi.includes(`"${segment}"`)) {
    fail(`catalogs-driver client missing segment ${segment}`);
  }
  if (!manifest.includes(`/lists/driver/${segment}`)) {
    fail(`manifest missing route /lists/driver/${segment}`);
  }
}

console.log("verify:drivers-subcatalogs-wired PASS");
