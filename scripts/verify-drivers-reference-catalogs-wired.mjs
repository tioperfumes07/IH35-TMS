#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STUB_MARKERS = ["Coming soon", "STUB", "<TableStub />"];

const CATALOG_PAGES = [
  {
    file: "apps/frontend/src/pages/lists/drivers/license-classes/Catalog.tsx",
    segment: "license-classes",
    client: "licenseClassesCatalogClient",
  },
  {
    file: "apps/frontend/src/pages/lists/drivers/endorsements/Catalog.tsx",
    segment: "endorsements",
    client: "cdlEndorsementsCatalogClient",
  },
  {
    file: "apps/frontend/src/pages/lists/drivers/restrictions/Catalog.tsx",
    segment: "restrictions",
    client: "cdlRestrictionsCatalogClient",
  },
  {
    file: "apps/frontend/src/pages/lists/drivers/medical-card-status/Catalog.tsx",
    segment: "medical-card-status",
    client: "medicalCardStatusCatalogClient",
  },
  {
    file: "apps/frontend/src/pages/lists/drivers/employment-status/Catalog.tsx",
    segment: "employment-status",
    client: "employmentStatusCatalogClient",
  },
];

function fail(message) {
  console.error(`verify:drivers-reference-catalogs-wired FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const apiClient = read("apps/frontend/src/api/lists-drivers-catalogs.ts");
const backendRoutes = read("apps/backend/src/lists/drivers-reference.routes.ts");
const backendShared = read("apps/backend/src/lists/drivers-reference.shared.ts");
const manifest = read("apps/frontend/src/routes/manifest.tsx");

for (const page of CATALOG_PAGES) {
  const src = read(page.file);
  for (const marker of STUB_MARKERS) {
    if (src.includes(marker)) fail(`${page.file} contains stub marker "${marker}"`);
  }
  if (!src.includes("DriversReferenceCatalogPage")) {
    fail(`${page.file} must use DriversReferenceCatalogPage`);
  }
  if (!src.includes(page.client)) fail(`${page.file} must import ${page.client}`);
  if (!apiClient.includes(`"${page.segment}"`)) {
    fail(`lists-drivers-catalogs client missing segment ${page.segment}`);
  }
  if (!backendShared.includes(`urlSegment: "${page.segment}"`)) {
    fail(`drivers-reference.shared missing urlSegment ${page.segment}`);
  }
  if (!backendRoutes.includes("/api/v1/lists/drivers/${config.urlSegment}")) {
    fail("drivers-reference.routes must build paths from config.urlSegment");
  }
  if (!manifest.includes(`/lists/drivers/${page.segment}`)) {
    fail(`manifest missing route /lists/drivers/${page.segment}`);
  }
}

console.log("verify:drivers-reference-catalogs-wired PASS");
