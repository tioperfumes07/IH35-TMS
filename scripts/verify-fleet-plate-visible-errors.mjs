#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["unit","connectivity","qbo_chrome"],"leaves":["unit.profile.identity"],"task":"FLEET-F6638-PLATE-ACTION-LIFECYCLE","vertical":"class-sweep"} */
/** FLT-F6323 / FLEET-F6638 — Plate writes expose failures and isolate unit/company lifecycle. */
import fs from "node:fs";

const FILE = "apps/frontend/src/components/vehicle-profile/PlatesTable.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/jurisdiction\.trim\(\)\.length > 0 && plateNumber\.trim\(\)\.length > 0/.test(text), "create must validate both required strings");
  need(/disabled=\{!createValid\}/.test(text), "Save plate must be disabled for invalid input");
  need((text.match(/createMutation\.reset\(\)/g) ?? []).length >= 2, "editing either required field must clear stale create state");
  need(/\{createError \?[\s\S]{0,180}role="alert"[\s\S]{0,180}Couldn&apos;t save plate/.test(text), "create failure must be visible");
  need(/\{archiveError \?[\s\S]{0,180}role="alert"[\s\S]{0,180}Couldn&apos;t archive plate/.test(text), "archive failure must be visible");
  need((text.match(/role="alert"/g) ?? []).length >= 2, "both mutation errors must be announced");
  need(/mutationFn:\s*\(input:\s*\{ unitId: string; companyId: string; generation: number; country: "US" \| "MX"; jurisdiction: string; plateNumber: string; expiration: string \}\)[\s\S]{0,300}platesUrl\(input\.unitId, input\.companyId\)[\s\S]{0,260}plate_number: input\.plateNumber/.test(text), "create snapshots unit company generation and complete draft");
  need(/mutationFn:\s*\(input:\s*\{ plateId: string; unitId: string; companyId: string; generation: number \}\)[\s\S]{0,240}input\.unitId[\s\S]{0,100}input\.plateId[\s\S]{0,160}input\.companyId/.test(text), "archive snapshots plate unit company and generation");
  need((text.match(/queryKey:\s*\["unit-profile", input\.unitId, input\.companyId\]/g) ?? []).length === 2, "both writes invalidate submitted unit/company cache");
  need(/actionGenerationRef\.current \+= 1;[\s\S]{0,160}setOpen\(false\);[\s\S]{0,180}setPlateNumber\(""\);[\s\S]{0,220}createMutation\.reset\(\);[\s\S]{0,80}archiveMutation\.reset\(\);[\s\S]{0,80}\[companyId, unitId\]/.test(text), "scope change retires actions and clears modal draft");
  need((text.match(/input\.generation === actionGenerationRef\.current/g) ?? []).length === 3, "create success and both failures reject stale completion state");
  need(/createMutation\.mutate\(\{\s*unitId,\s*companyId,\s*generation: actionGenerationRef\.current,[\s\S]{0,160}plateNumber,[\s\S]{0,80}expiration/.test(text), "save click snapshots visible plate intent");
  need(/archiveMutation\.mutate\(\{ plateId: row\.id, unitId, companyId, generation: actionGenerationRef\.current \}\)/.test(text), "archive click snapshots visible row intent");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-fleet-plate-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("jurisdiction.trim().length > 0 && plateNumber.trim().length > 0", "true"),
    source.replace("disabled={!createValid}", "disabled={false}"),
    source.replaceAll("createMutation.reset();", ""),
    source.replace("{createError ?", "{false ?"),
    source.replace("{archiveError ?", "{false ?"),
    source.replaceAll('role="alert"', 'role="status"'),
    source.replace("platesUrl(input.unitId, input.companyId)", "platesUrl(unitId, companyId)"),
    source.replace("input.plateId}/archive", "row.id}/archive"),
    source.replace('["unit-profile", input.unitId, input.companyId]', '["unit-profile", unitId, companyId]'),
    source.replace("actionGenerationRef.current += 1;", "void actionGenerationRef.current;"),
    source.replace("input.generation === actionGenerationRef.current", "true"),
    source.replace("plateNumber,\n                expiration,", 'plateNumber: "",\n                expiration,'),
    source.replace("plateId: row.id, unitId, companyId, generation: actionGenerationRef.current", "plateId: row.id"),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-fleet-plate-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-fleet-plate-visible-errors PASS — plate create/archive failures are visible");
