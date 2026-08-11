import { readFileSync } from "node:fs";

const SRC = "apps/frontend/src/api/accounting.ts";
const source = readFileSync(SRC, "utf8");

const match = source.match(/listClassesForJe\(\)[\s\S]{0,400}?\/api\/v1\/catalogs\/classes[^\n]*limit=(\d+)/);
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
