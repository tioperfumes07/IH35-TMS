#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety"],"cols":["driver","unit","connectivity","qbo_chrome"],"leaves":["driver_scheduler.list"],"task":"CLASS-F6538-DRIVER-SCHEDULER-TEMP-COVER-COMPANY-LIFECYCLE","vertical":"class-sweep"}
 * Temp-cover create/cancel modals, drafts, targets and callbacks must belong to
 * the exact selected operating company.
 */
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx";

function inspect(source) {
  const errors = [];
  const closeAssignBody = source.match(/const closeAssign = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
  const closeCancelBody = source.match(/const closeCancel = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
  if (!source.includes("const emptyTempCoverForm = ()")) errors.push("fresh-date draft factory missing");
  if (!/useEffect\(\(\) => \{[\s\S]*assignMutation\.reset\(\)[\s\S]*cancelMutation\.reset\(\)[\s\S]*setTempCoverModalOpen\(false\)[\s\S]*setCancelTarget\(null\)[\s\S]*\}, \[operatingCompanyId\]\)/.test(source)) {
    errors.push("company transition does not reset both modal workflows");
  }
  if (!/mutationFn: \(input: \{ operatingCompanyId: string; form: TempCoverForm; generation: number \}\)[\s\S]*assignTempCover\(input\.operatingCompanyId/.test(source)) {
    errors.push("assignment does not snapshot company and complete form");
  }
  if (!/mutationFn: \(input: \{ operatingCompanyId: string; assignmentId: string; reason: string; generation: number \}\)[\s\S]*cancelTempCover\(input\.operatingCompanyId, input\.assignmentId, input\.reason\)/.test(source)) {
    errors.push("cancellation does not snapshot company, target and reason");
  }
  const generationGuards = source.match(/input\.generation !== lifecycleGenerationRef\.current/g)?.length ?? 0;
  if (generationGuards !== 4) errors.push("assign/cancel success and error are not all stale-context guarded");
  if (!/form: \{ \.\.\.tempCoverForm \},[\s\S]{0,100}generation: lifecycleGenerationRef\.current/.test(source)) errors.push("create UI does not snapshot draft/generation");
  if (!/assignmentId: cancelTarget\.id,[\s\S]{0,120}reason: cancelReason\.trim\(\),[\s\S]{0,120}generation: lifecycleGenerationRef\.current/.test(source)) errors.push("cancel UI does not snapshot target/reason/generation");
  if (!source.includes("disabled={!cancelReason.trim()}")) errors.push("cancel reason is not required in product chrome");
  if ((source.match(/lifecycleGenerationRef\.current \+= 1;\s*pushToast/g)?.length ?? 0) !== 2) errors.push("current assign/cancel success does not retire its generation");
  if (!closeAssignBody.includes("if (assignMutation.isPending) return") || !closeAssignBody.includes("setTempCoverForm(emptyTempCoverForm())")) errors.push("assignment pending/draft close lifecycle missing");
  if (!closeCancelBody.includes("if (cancelMutation.isPending) return") || !closeCancelBody.includes('setCancelReason("")')) errors.push("cancellation pending/reason close lifecycle missing");
  if (!/const isAssignDirty =[\s\S]*unitId \|\| tempCoverForm\.primaryDriverId \|\| tempCoverForm\.coverDriverId[\s\S]*startDate !== companyToday\(\)[\s\S]*endDate !== companyToday\(\)[\s\S]*notes\.trim\(\)/.test(source)) errors.push("assignment dirty predicate incomplete");
  if ((source.match(/confirmDiscardOnClose/g)?.length ?? 0) !== 2 || !source.includes("isDirty={isAssignDirty}") || !source.includes("isDirty={Boolean(cancelReason.trim())}") || !source.includes("onClick={assignAttemptClose} disabled={assignMutation.isPending}") || !source.includes("onClick={cancelAttemptClose} disabled={cancelMutation.isPending}")) errors.push("modal dismiss paths bypass dirty confirmation or pending lock");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const mutations = [
    source.replace("assignMutation.reset();", "// planted: assign reset removed"),
    source.replace("assignTempCover(input.operatingCompanyId", "assignTempCover(operatingCompanyId"),
    source.replace("cancelTarget.id", '"stale-id"'),
    source.replaceAll("input.generation !== lifecycleGenerationRef.current", "false"),
    source.replace("if (assignMutation.isPending) return;", "void assignMutation.isPending;"),
    source.replace("if (cancelMutation.isPending) return;", "void cancelMutation.isPending;"),
    source.replace("confirmDiscardOnClose", ""),
    source.replace("|| tempCoverForm.startDate !== companyToday()", ""),
    source.replace("setCancelReason(\"\");\n  };", "};"),
    source.replace("lifecycleGenerationRef.current += 1;\n      pushToast(\"Temp cover assigned\"", "pushToast(\"Temp cover assigned\""),
  ];
  const missed = mutations.map((candidate, index) => ({ candidate, index })).filter(({ candidate }) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-driver-scheduler-temp-cover-company-lifecycle SELFTEST FAIL — ${missed.length}/10 mutation(s) survived: ${missed.map(({ index }) => index + 1).join(",")}`);
    process.exit(1);
  }
  console.log("verify-driver-scheduler-temp-cover-company-lifecycle selftest PASS — 10/10 planted defects rejected");
  process.exit(0);
}

const errors = inspect(fs.readFileSync(FILE, "utf8"));
if (errors.length) {
  console.error("verify-driver-scheduler-temp-cover-company-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-driver-scheduler-temp-cover-company-lifecycle PASS — create/cancel workflows are company-local");
