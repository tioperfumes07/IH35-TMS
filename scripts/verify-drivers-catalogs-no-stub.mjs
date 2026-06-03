#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CATALOG_FILES = [
  "apps/frontend/src/pages/lists/drivers/license-classes/Catalog.tsx",
  "apps/frontend/src/pages/lists/drivers/endorsements/Catalog.tsx",
  "apps/frontend/src/pages/lists/drivers/restrictions/Catalog.tsx",
  "apps/frontend/src/pages/lists/drivers/medical-card-status/Catalog.tsx",
  "apps/frontend/src/pages/lists/drivers/employment-status/Catalog.tsx",
];

const STUB_MARKERS = ["Coming soon", "STUB", "<TableStub />"];

function fail(message) {
  console.error(`verify:drivers-catalogs-no-stub FAIL: ${message}`);
  process.exit(1);
}

for (const rel of CATALOG_FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing catalog page ${rel}`);
  const src = fs.readFileSync(abs, "utf8");
  for (const marker of STUB_MARKERS) {
    if (src.includes(marker)) fail(`${rel} contains stub marker "${marker}"`);
  }
}

console.log("verify:drivers-catalogs-no-stub PASS");
