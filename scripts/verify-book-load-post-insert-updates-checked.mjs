#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/dispatch/book-load.service.ts";
const source = fs.readFileSync(path.join(ROOT, TARGET), "utf8");

const blocks = [
  ["shipmentDetailsUpdate", "book_load_shipment_details_update_failed"],
  ["equipmentDetailsUpdate", "book_load_equipment_details_update_failed"],
  ["tripDetailsUpdate", "book_load_trip_details_update_failed"],
];

function problemsFor(src) {
  const problems = [];
  for (const [result, error] of blocks) {
    const declaration = new RegExp(`const ${result} = await client\\.query<\\{ id: string \\}>\\([\\s\\S]{0,900}?WHERE id = \\$[0-9]+::uuid AND operating_company_id = \\$[0-9]+::uuid[\\s\\S]{0,180}?RETURNING id::text`);
    if (!declaration.test(src)) problems.push(`${result} must company-scope and RETURN the persisted load identity`);
    if (!new RegExp(`if \\(!${result}\\.rows\\[0\\]\\?\\.id\\) throw new Error\\("${error}"\\)`).test(src)) {
      problems.push(`${result} must abort Book Load on a zero-row write`);
    }
  }
  return problems;
}

const problems = problemsFor(source);
if (problems.length) {
  console.error(`verify-book-load-post-insert-updates-checked FAIL:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const planted = source.replace(
    'if (!equipmentDetailsUpdate.rows[0]?.id) throw new Error("book_load_equipment_details_update_failed");',
    "// planted: silently accept a lost equipment details write"
  );
  if (!problemsFor(planted).some((problem) => problem.includes("equipmentDetailsUpdate must abort"))) {
    console.error("verify-book-load-post-insert-updates-checked SELFTEST FAIL: planted zero-row silence escaped");
    process.exit(1);
  }
  console.log("verify-book-load-post-insert-updates-checked SELFTEST PASS");
}

console.log("verify-book-load-post-insert-updates-checked PASS — all three visible-field post-insert writes are company-scoped and checked");
