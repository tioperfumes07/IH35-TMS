#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety"],"cols":["unit","connectivity","reverse_link","qbo_chrome"],"leaves":["safety.permits.list","safety.modal.permit_create"],"task":"CLASS-F6541-SAFETY-PERMITS-COMPANY-LIFECYCLE","vertical":"class-sweep"}
 */
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/pages/safety/PermitsPage.tsx";

function inspect(source) {
  const errors = [];
  const closeCreateBody = source.match(/const closeCreate = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
  if (!source.includes("lifecycleGenerationRef") || !/useEffect\(\(\) => \{[\s\S]*createMutation\.reset\(\)[\s\S]*reminderMutation\.reset\(\)[\s\S]*archiveMutation\.reset\(\)[\s\S]*restoreMutation\.reset\(\)[\s\S]*setCreateOpen\(false\)[\s\S]*setDraft\(emptyDraft\)[\s\S]*\}, \[operatingCompanyId\]\)/.test(source)) errors.push("company transition does not reset all permit workflows");
  if (!/createSafetyPermit\(input\.companyId, input\.payload\)/.test(source)) errors.push("create does not snapshot company and full payload");
  if (!/updatePermitRenewalReminder\(input\.companyId, \{ days_before_expiry: input\.daysBeforeExpiry \}\)/.test(source)) errors.push("reminder save does not snapshot company and value");
  if (!/archiveSafetyPermit\(input\.id, input\.companyId\)/.test(source) || !/restoreSafetyPermit\(input\.id, input\.companyId\)/.test(source)) errors.push("archive/restore do not snapshot company and permit");
  const generationGuards = source.match(/input\.generation !== lifecycleGenerationRef\.current/g)?.length ?? 0;
  if (generationGuards !== 4) errors.push("all four success paths must reject stale company responses");
  if (!["lifecycleGenerationRef.current += 1", "createMutation.reset()", "setCreateOpen(false)", "setDraft(emptyDraft)"].every((token) => closeCreateBody.includes(token)) || !source.includes("onClick={closeCreate}")) errors.push("permit create dismiss does not retire generation and reset draft/mutation");
  if (!source.includes("createMutation.isError && createMutation.variables?.generation === lifecycleGenerationRef.current")) errors.push("stale create rejection can paint a reopened permit modal");
  if (!source.includes("reminderMutation.isError && reminderMutation.variables?.generation === lifecycleGenerationRef.current")) errors.push("stale reminder rejection can paint the next company");
  if (!/const archiveErrorCurrent =\s*archiveMutation\.isError && archiveMutation\.variables\?\.generation === lifecycleGenerationRef\.current/.test(source) || !/const restoreErrorCurrent =\s*restoreMutation\.isError && restoreMutation\.variables\?\.generation === lifecycleGenerationRef\.current/.test(source) || !source.includes("archiveErrorCurrent || restoreErrorCurrent")) errors.push("stale archive/restore rejection can paint the next company");
  if (!source.includes('queryKey: ["safety", "permits", input.companyId]')) errors.push("success refresh is not pinned to submitting company");
  if (!/canonicalDays[\s\S]*setReminderDays\(String\(canonicalDays\)\)/.test(source)) errors.push("reminder editor does not hydrate canonical company setting");
  if (!source.includes('kind="unit"') || !source.includes("allowCreate") || !source.includes("unit_id: draft.unit_id || null")) errors.push("canonical unit picker/create/FK path removed");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const mutations = [
    source.replace("createMutation.reset();", "// planted: create survives"),
    source.replace("createSafetyPermit(input.companyId, input.payload)", "createSafetyPermit(operatingCompanyId, input.payload)"),
    source.replace("archiveSafetyPermit(input.id, input.companyId)", "archiveSafetyPermit(input.id, operatingCompanyId)"),
    source.replace("input.generation !== lifecycleGenerationRef.current", "false"),
    source.replace("setReminderDays(String(canonicalDays))", "setReminderDays(\"30\")"),
    source.replace("onClick={closeCreate}", "onClick={() => setCreateOpen(false)}"),
    source.replace("createMutation.isError && createMutation.variables?.generation === lifecycleGenerationRef.current", "createMutation.isError"),
    source.replace("reminderMutation.isError && reminderMutation.variables?.generation === lifecycleGenerationRef.current", "reminderMutation.isError"),
    source.replace("archiveMutation.isError && archiveMutation.variables?.generation === lifecycleGenerationRef.current", "archiveMutation.isError"),
  ];
  const missed = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-safety-permits-company-lifecycle SELFTEST FAIL — ${missed.length}/9 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-safety-permits-company-lifecycle selftest PASS — 9/9 planted defects rejected");
  process.exit(0);
}

const errors = inspect(fs.readFileSync(FILE, "utf8"));
if (errors.length) {
  console.error("verify-safety-permits-company-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-safety-permits-company-lifecycle PASS — permit actions are company-local");
