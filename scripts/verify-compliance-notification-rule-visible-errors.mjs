#!/usr/bin/env node
/** COMP-F6339 — notification-rule create/archive must surface rejected writes. */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/const \[ruleError, setRuleError\]/.test(text), "shared rule error state required");
  need(/const createRuleM = useMutation[\s\S]*onMutate: \(\) => setRuleError\(null\)[\s\S]*onError: \(error\)[\s\S]*Failed to create notification rule/.test(text), "create failure must be visible");
  need(/const archiveRuleM = useMutation[\s\S]*onMutate: \(\) => setRuleError\(null\)[\s\S]*onError: \(error\)[\s\S]*Failed to archive notification rule/.test(text), "archive failure must be visible");
  need(/role="alert"[\s\S]*\{ruleError\}/.test(text), "rule failure must render accessibly");
  need((text.match(/error instanceof Error \? error\.message/g) ?? []).length >= 2, "both actions must preserve backend detail");
  need(/archiveComplianceRule\(id, companyId\)/.test(text), "archive must retain selected-company scope");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-compliance-notification-rule-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/\n    onError: \(error\)[\s\S]*?create notification rule"\),/, ""),
    source.replace(/\n    onError: \(error\)[\s\S]*?archive notification rule"\),/, ""),
    source.replace(/\n        \{ruleError \? \([\s\S]*?\n        \) : null\}/, ""),
    source.replace("error instanceof Error ? error.message", '"Request failed"'),
    source.replace("archiveComplianceRule(id, companyId)", "archiveComplianceRule(id, '')"),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-compliance-notification-rule-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-compliance-notification-rule-visible-errors PASS — create/archive failures are visible");
