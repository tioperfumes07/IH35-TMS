#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety"],"cols":["driver","connectivity","reverse_link","qbo_chrome"],"leaves":["safety.training.records","safety.modal.training_record_create"],"task":"CLASS-F6543-TRAINING-RECORD-COMPANY-LIFECYCLE","vertical":"class-sweep"}
 */
import fs from "node:fs";
import process from "node:process";
const FILE = "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx";
function inspect(source) {
  const errors = [];
  if (!/useEffect\(\(\) => \{[\s\S]*createMutation\.reset\(\)[\s\S]*setCreateOpen\(false\)[\s\S]*setDriverId\(""\)[\s\S]*setTrainingName\(""\)[\s\S]*setCompletedAt\(companyToday\(\)\)[\s\S]*setExpiryDate\(""\)[\s\S]*setNotes\(""\)[\s\S]*\}, \[operatingCompanyId\]\)/.test(source)) errors.push("company transition does not reset complete training creator lifecycle");
  if (!/createSafetyTrainingRecord\(input\.companyId, input\.payload\)/.test(source)) errors.push("create does not snapshot company and payload");
  if (!source.includes("input.generation !== lifecycleGenerationRef.current")) errors.push("stale success can mutate new company UI");
  if (!source.includes('["safety", "training-records", input.companyId]') || !source.includes('["safety", "training-completions", input.companyId]')) errors.push("success refreshes are not pinned to submitting company");
  if (!/payload: \{[\s\S]*driver_id: driverId[\s\S]*training_name: trainingName\.trim\(\)[\s\S]*completed_at:[\s\S]*expiry_date: expiryDate \|\| undefined[\s\S]*notes: notes\.trim\(\) \|\| undefined/.test(source)) errors.push("submit does not carry every visible training field");
  if (!source.includes("<DriverPickerWithCreate") || !source.includes("operatingCompanyId={operatingCompanyId}")) errors.push("canonical scoped driver picker/create removed");
  return errors;
}
if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const mutations = [
    source.replace("createMutation.reset();", "// planted: mutation survives"),
    source.replace("createSafetyTrainingRecord(input.companyId, input.payload)", "createSafetyTrainingRecord(operatingCompanyId, input.payload)"),
    source.replace("input.generation !== lifecycleGenerationRef.current", "false"),
    source.replace("setDriverId(\"\");\n    setTrainingName(\"\");\n    setCompletedAt(companyToday());", "// planted: company transition retains driver/name/date"),
    source.replace("notes: notes.trim() || undefined", "notes: undefined"),
  ];
  const missed = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-training-record-company-lifecycle SELFTEST FAIL — ${missed.length}/5 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-training-record-company-lifecycle selftest PASS — 5/5 planted defects rejected");
  process.exit(0);
}
const errors = inspect(fs.readFileSync(FILE, "utf8"));
if (errors.length) {
  console.error("verify-training-record-company-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-training-record-company-lifecycle PASS — training creator is company-local");
