#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety"],"cols":["connectivity"],"leaves":["settings.list"],"task":"CLASS-F6531-SAFETY-SETTINGS-CONTEXT-LIFECYCLE","vertical":"class-sweep"}
 * Safety settings must reset from the canonical company/settings response and an
 * older company's save must not refresh the newly selected company.
 */
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/pages/safety/components/SafetySettingsForm.tsx";

function inspect(source) {
  const errors = [];
  if (!source.includes("useEffect") || !source.includes("lifecycleGenerationRef")) {
    errors.push("missing company/settings lifecycle generation");
  }
  if (!/useEffect\(\(\) => \{[\s\S]*mutation\.reset\(\)[\s\S]*setActiveWindow\(String\(settings\.dashboard_active_window_days/.test(source)) {
    errors.push("canonical settings do not reset the visible draft and mutation state");
  }
  if (!/\}, \[operatingCompanyId, settings\]\)/.test(source)) {
    errors.push("draft reset is not scoped to company and canonical settings");
  }
  if (!/mutationFn: \(\{ companyId, body \}/.test(source) || !source.includes("updateSafetySettings(companyId, body)")) {
    errors.push("save does not snapshot the submitting company and body");
  }
  if (!source.includes("variables.generation !== lifecycleGenerationRef.current")) {
    errors.push("stale save success can refresh the new company context");
  }
  if (!/mutation\.mutate\(\{[\s\S]*companyId: operatingCompanyId,[\s\S]*generation: lifecycleGenerationRef\.current,[\s\S]*body:/.test(source)) {
    errors.push("submit does not carry its company/generation snapshot");
  }
  if (!/const saveErrorCurrent =[\s\S]*mutation\.isError[\s\S]*mutation\.variables\?\.companyId === operatingCompanyId[\s\S]*mutation\.variables\?\.generation === lifecycleGenerationRef\.current/.test(source)) {
    errors.push("save rejection is not scoped to the active company generation");
  }
  if (!/\{saveErrorCurrent \? \([\s\S]*data-testid="safety-settings-save-error"/.test(source)) {
    errors.push("save rejection banner does not use the current-generation predicate");
  }
  return errors;
}

function selftest() {
  const source = fs.readFileSync(FILE, "utf8");
  const mutations = [
    source.replace("mutation.reset();", "// planted: mutation reset removed"),
    source.replace("variables.generation !== lifecycleGenerationRef.current", "false"),
    source.replace("companyId: operatingCompanyId,", "companyId: \"\","),
    source.replace("mutation.variables?.companyId === operatingCompanyId", "true"),
    source.replace("{saveErrorCurrent ? (", "{mutation.isError ? ("),
  ];
  const missed = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-safety-settings-context-lifecycle SELFTEST FAIL — ${missed.length}/5 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-safety-settings-context-lifecycle selftest PASS — 5/5 planted defects rejected");
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = inspect(fs.readFileSync(FILE, "utf8"));
if (errors.length) {
  console.error("verify-safety-settings-context-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-safety-settings-context-lifecycle PASS — company/settings draft reset and stale-save isolation are wired");
