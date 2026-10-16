import { readFileSync } from "node:fs";

const SRC = "apps/frontend/src/api/accounting.ts";
const source = readFileSync(SRC, "utf8");

// LEAD 443.160: listClassesForJe reads the one class source (classesCatalogClient); the cap is its `limit:`.
const match = source.match(/listClassesForJe\(operatingCompanyId: string\)[\s\S]{0,500}?classesCatalogClient\.list\([^\n]*limit:\s*(\d+)/);
if (!match) {
  console.error(`FAIL: ${SRC}: could not locate listClassesForJe() limit`);
  process.exit(1);
}

const limit = Number(match[1]);
if (Number.isNaN(limit) || limit > 200) {
  console.error(`FAIL: ${SRC}: listClassesForJe() sends limit=${match[1]}; backend caps at 200`);
  process.exit(1);
}

console.log(`PASS: listClassesForJe() limit=${limit} <= 200`);
