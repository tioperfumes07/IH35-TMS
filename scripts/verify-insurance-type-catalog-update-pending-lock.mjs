#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/pages/insurance/TypeCatalogAdmin.tsx";

function inspect(source) {
  const failures = [];
  const checks = [
    ["row switch rejected while pending", /const beginEdit = \(row: InsuranceTypeCatalogEntry\) => \{\s*if \(updateMutation\.isPending\) return;/],
    ["close rejected while pending", /const closeEdit = \(\) => \{\s*if \(updateMutation\.isPending\) return;\s*setEditingId\(null\);\s*updateMutation\.reset\(\);/],
    ["cancel uses guarded close", /closeEdit\(\);[\s\S]{0,120}disabled=\{updateMutation\.isPending\}/],
    ["other edit buttons locked", /beginEdit\(row\);[\s\S]{0,120}disabled=\{updateMutation\.isPending\}/],
  ];
  for (const [label, pattern] of checks) {
    if (!pattern.test(source)) failures.push(label);
  }
  const lockedInputs = source.match(/disabled=\{updateMutation\.isPending\}/g)?.length ?? 0;
  if (lockedInputs < 6) failures.push("all four draft controls plus Cancel/Edit are locked while pending");
  return failures;
}

const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("if (updateMutation.isPending) return;\n    setEditingId(row.id);", "setEditingId(row.id);"),
    source.replace("if (updateMutation.isPending) return;\n    setEditingId(null);", "setEditingId(null);"),
    source.replace("closeEdit();", "setEditingId(null);"),
    source.replace("beginEdit(row);", "setEditingId(row.id);"),
    source.replace("disabled={updateMutation.isPending}", "disabled={false}"),
  ];
  const survived = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (survived.length) {
    console.error(`FAIL verify-insurance-type-catalog-update-pending-lock --selftest: ${survived.length}/${mutations.length} planted defects survived`);
    process.exit(1);
  }
  console.log(`PASS verify-insurance-type-catalog-update-pending-lock --selftest (${mutations.length} mutations killed)`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  console.error(`FAIL verify-insurance-type-catalog-update-pending-lock: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS verify-insurance-type-catalog-update-pending-lock");
