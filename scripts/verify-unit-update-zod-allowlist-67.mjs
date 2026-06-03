import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const schemaPath = path.join(root, "apps/backend/src/mdata/unit-update-schema.ts");
const src = fs.readFileSync(schemaPath, "utf8");

const match = src.match(/UNIT_PATCHABLE_FIELD_KEYS\s*=\s*\[([\s\S]*?)\]\s*as const/);
if (!match) {
  console.error("[verify-unit-update-zod-allowlist-67] UNIT_PATCHABLE_FIELD_KEYS array not found");
  process.exit(1);
}

const keys = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
if (keys.length < 50) {
  console.error(`[verify-unit-update-zod-allowlist-67] Expected >= 50 patchable fields, got ${keys.length}`);
  process.exit(1);
}

if (!src.includes("updateUnitBodySchema")) {
  console.error("[verify-unit-update-zod-allowlist-67] updateUnitBodySchema missing");
  process.exit(1);
}

console.log(`[verify-unit-update-zod-allowlist-67] OK (${keys.length} fields)`);
