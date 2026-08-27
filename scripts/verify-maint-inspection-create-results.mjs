#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/maintenance/inspections.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const checks = [
    ["inspection insert identity", /const id = res\.rows\[0\]\?\.id;\s*if \(!id\) throw new Error\("maintenance_inspection_insert_failed"\)/],
    ["inspection detail read truth", /const detail = await client\.query[\s\S]{0,180}if \(!detail\.rows\[0\]\) throw new Error\("maintenance_inspection_detail_read_failed"\);\s*return mapInspectionRow\(detail\.rows\[0\]\)/],
    ["photo insert identity", /const insertedPhoto = res\.rows\[0\];\s*if \(!insertedPhoto\?\.id\) throw new Error\("maintenance_inspection_photo_insert_failed"\)/],
    ["photo response uses proven row", /return insertedPhoto;/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(candidate)).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-maint-inspection-create-results FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ['if (!id) throw new Error("maintenance_inspection_insert_failed");', ""],
    ['if (!detail.rows[0]) throw new Error("maintenance_inspection_detail_read_failed");', ""],
    ['if (!insertedPhoto?.id) throw new Error("maintenance_inspection_photo_insert_failed");', ""],
    ["return insertedPhoto;", "return res.rows[0];"],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-maint-inspection-create-results selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-maint-inspection-create-results --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-maint-inspection-create-results PASS — inspection and photo creators require canonical rows");
