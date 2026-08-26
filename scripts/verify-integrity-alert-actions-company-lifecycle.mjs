#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety"],"cols":["driver","vendor","unit","connectivity","reverse_link","qbo_chrome"],"leaves":["safety.integrity_alerts.list","safety.modal.integrity_rule"],"task":"CLASS-F6542-INTEGRITY-ALERT-ACTIONS-COMPANY-LIFECYCLE","vertical":"class-sweep"}
 */
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/pages/safety/IntegrityAlertsPage.tsx";
function inspect(source) {
  const errors = [];
  if (!/useEffect\(\(\) => \{[\s\S]*evaluateMutation\.reset\(\)[\s\S]*saveRuleMutation\.reset\(\)[\s\S]*setSelected\(null\)[\s\S]*setEditingRule\(null\)[\s\S]*setCreateRuleOpen\(false\)[\s\S]*setDraftRule\(EMPTY_RULE_DRAFT\)[\s\S]*\}, \[operatingCompanyId\]\)/.test(source)) errors.push("company transition does not reset evaluator/editor/drawer state");
  if (!/evaluateIntegrityAlerts\(input\.companyId\)/.test(source)) errors.push("evaluator does not snapshot company");
  if (!/updateIntegrityAlertRule\(input\.ruleId, input\.companyId, input\.payload\)/.test(source) || !/createIntegrityAlertRule\(input\.companyId, input\.payload\)/.test(source)) errors.push("rule create/update do not snapshot company, id, and payload");
  const generationGuards = source.match(/input\.generation !== lifecycleGenerationRef\.current/g)?.length ?? 0;
  if (generationGuards !== 2) errors.push("evaluator and rule success must reject stale company responses");
  if (!source.includes('["safety", "integrity-alerts", input.companyId]') || !source.includes('["safety", "integrity-alert-rules", input.companyId]')) errors.push("success refreshes are not pinned to submitting company");
  if (!/ruleId: editingRule\?\.id \? String\(editingRule\.id\) : null/.test(source) || !/payload: editingRule\?\.id \? \{/.test(source)) errors.push("save action does not submit immutable editor snapshot");
  for (const kind of ["driver", "unit", "vendor"]) if (!source.includes(`kind="${kind}"`)) errors.push(`${kind} picker/reverse surface removed`);
  return errors;
}

if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const mutations = [
    source.replace("evaluateMutation.reset();", "// planted: evaluator survives"),
    source.replace("evaluateIntegrityAlerts(input.companyId)", "evaluateIntegrityAlerts(operatingCompanyId)"),
    source.replace("updateIntegrityAlertRule(input.ruleId, input.companyId, input.payload)", "updateIntegrityAlertRule(input.ruleId, operatingCompanyId, input.payload)"),
    source.replace("input.generation !== lifecycleGenerationRef.current", "false"),
    source.replace("setSelected(null);", "// planted: prior drawer survives"),
  ];
  const missed = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-integrity-alert-actions-company-lifecycle SELFTEST FAIL — ${missed.length}/5 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-integrity-alert-actions-company-lifecycle selftest PASS — 5/5 planted defects rejected");
  process.exit(0);
}
const errors = inspect(fs.readFileSync(FILE, "utf8"));
if (errors.length) {
  console.error("verify-integrity-alert-actions-company-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-integrity-alert-actions-company-lifecycle PASS — integrity actions are company-local");
