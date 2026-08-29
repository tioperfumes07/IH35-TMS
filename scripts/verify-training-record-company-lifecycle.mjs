#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety"],"cols":["driver","connectivity","reverse_link","qbo_chrome"],"leaves":["safety.training.records","safety.modal.training_record_create"],"task":"CLASS-F6543-TRAINING-RECORD-COMPANY-LIFECYCLE","vertical":"class-sweep"}
 */
import fs from "node:fs";
import process from "node:process";
const FILE = "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx";
const BACKEND_FILE = "apps/backend/src/mdata/driver-training.routes.ts";
function inspect(source, backend) {
  const errors = [];
  const createSchemaBody = backend.match(/const createTrainingSchema = z\.object\(\{([\s\S]*?)\n\}\);/)?.[1] ?? "";
  const patchSchemaBody = backend.match(/const patchTrainingSchema = z\.object\(\{([\s\S]*?)\n\}\);/)?.[1] ?? "";
  const closeCreateBody = source.match(/const closeCreate = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
  const successBody = source.match(/onSuccess: \(_result, input\) => \{([\s\S]*?)\n    \},/)?.[1] ?? "";
  if (!/useEffect\(\(\) => \{[\s\S]*createMutation\.reset\(\)[\s\S]*setCreateOpen\(false\)[\s\S]*setDriverId\(""\)[\s\S]*setTrainingName\(""\)[\s\S]*setCompletedAt\(companyToday\(\)\)[\s\S]*setExpiryDate\(""\)[\s\S]*setNotes\(""\)[\s\S]*\}, \[operatingCompanyId\]\)/.test(source)) errors.push("company transition does not reset complete training creator lifecycle");
  if (!/createSafetyTrainingRecord\(input\.companyId, input\.payload\)/.test(source)) errors.push("create does not snapshot company and payload");
  if (!source.includes("input.generation !== lifecycleGenerationRef.current")) errors.push("stale success can mutate new company UI");
  if (!successBody.includes("lifecycleGenerationRef.current += 1") || !successBody.includes("setCompletedAt(companyToday())")) errors.push("current success does not retire generation and reset completion date");
  if (!["lifecycleGenerationRef.current += 1", "createMutation.reset()", 'setCreateOpen(false)', 'setDriverId("")', 'setTrainingName("")', "setCompletedAt(companyToday())", 'setExpiryDate("")', 'setNotes("")'].every((token) => closeCreateBody.includes(token)) || !source.includes('<Modal variant="drawer" open={createOpen} onClose={closeCreate}')) errors.push("drawer dismiss does not retire the generation and reset the complete draft");
  if (!closeCreateBody.includes("if (createMutation.isPending) return")) errors.push("pending create can be dismissed");
  if (!/const isCreateDirty =[\s\S]*Boolean\(driverId\)[\s\S]*trainingName\.trim\(\)[\s\S]*completedAt !== companyToday\(\)[\s\S]*Boolean\(expiryDate\)[\s\S]*notes\.trim\(\)/.test(source)) errors.push("dirty predicate does not cover every training field");
  if (!/<Modal variant="drawer" open=\{createOpen\} onClose=\{closeCreate\}[^>]*confirmDiscardOnClose[^>]*isDirty=\{isCreateDirty\}[^>]*onRegisterAttemptClose=\{\(next\) => setAttemptClose\(\(\) => next\)\}/.test(source) || !/onClick=\{attemptClose\} disabled=\{createMutation\.isPending\}/.test(source)) errors.push("drawer dismiss paths do not safely register dirty confirmation and pending lock");
  if (!source.includes("createMutation.isError && createMutation.variables?.generation === lifecycleGenerationRef.current")) errors.push("stale rejection can paint a reopened training drawer");
  if (!source.includes('["safety", "training-records", input.companyId]') || !source.includes('["safety", "training-completions", input.companyId]')) errors.push("success refreshes are not pinned to submitting company");
  if (!/payload: \{[\s\S]*driver_id: driverId[\s\S]*training_name: trainingName\.trim\(\)[\s\S]*completed_at:[\s\S]*expiry_date: expiryDate \|\| undefined[\s\S]*notes: notes\.trim\(\) \|\| undefined/.test(source)) errors.push("submit does not carry every visible training field");
  if (!source.includes("<DriverPickerWithCreate") || !source.includes("operatingCompanyId={operatingCompanyId}")) errors.push("canonical scoped driver picker/create removed");
  if (!/completed_at: z\.string\(\)\.datetime\(\{ offset: true \}\)/.test(createSchemaBody)) errors.push("create completed_at can reach PostgreSQL without ISO timestamp validation");
  if (!/completed_at: z\.string\(\)\.datetime\(\{ offset: true \}\)\.optional\(\)/.test(patchSchemaBody)) errors.push("edit completed_at can reach PostgreSQL without ISO timestamp validation");
  return errors;
}
if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const backend = fs.readFileSync(BACKEND_FILE, "utf8");
  const mutations = [
    source.replace("createMutation.reset();", "// planted: mutation survives"),
    source.replace("createSafetyTrainingRecord(input.companyId, input.payload)", "createSafetyTrainingRecord(operatingCompanyId, input.payload)"),
    source.replace("input.generation !== lifecycleGenerationRef.current", "false"),
    source.replace("setDriverId(\"\");\n    setTrainingName(\"\");\n    setCompletedAt(companyToday());", "// planted: company transition retains driver/name/date"),
    source.replace("notes: notes.trim() || undefined", "notes: undefined"),
    source.replace("onClose={closeCreate}", "onClose={() => setCreateOpen(false)}"),
    source.replace("createMutation.isError && createMutation.variables?.generation === lifecycleGenerationRef.current", "createMutation.isError"),
    source.replace("if (createMutation.isPending) return;", "void createMutation.isPending;"),
    source.replace("confirmDiscardOnClose", ""),
    source.replace("onClick={attemptClose} disabled={createMutation.isPending}", "onClick={closeCreate}"),
    source.replace("|| Boolean(expiryDate)", ""),
    source.replace("setCompletedAt(companyToday());\n      setExpiryDate", "setExpiryDate"),
  ];
  const missed = mutations.filter((candidate) => inspect(candidate, backend).length === 0);
  const backendMutations = [
    backend.replace('completed_at: z.string().datetime({ offset: true }),', 'completed_at: z.string(),'),
    backend.replace('completed_at: z.string().datetime({ offset: true }).optional(),', 'completed_at: z.string().optional(),'),
  ];
  missed.push(...backendMutations.filter((candidate) => inspect(source, candidate).length === 0));
  if (missed.length) {
    console.error(`verify-training-record-company-lifecycle SELFTEST FAIL — ${missed.length}/14 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-training-record-company-lifecycle selftest PASS — 14/14 planted defects rejected");
  process.exit(0);
}
const errors = inspect(fs.readFileSync(FILE, "utf8"), fs.readFileSync(BACKEND_FILE, "utf8"));
if (errors.length) {
  console.error("verify-training-record-company-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-training-record-company-lifecycle PASS — training creator is company-local");
