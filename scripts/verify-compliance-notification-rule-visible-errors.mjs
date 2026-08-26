#!/usr/bin/env node
/** @matrix-built {"modules":["compliance"],"cols":["connectivity"],"leaves":["overview.notification_rules"],"task":"COMPLIANCE-F6624-NOTIFICATION-RULE-LIFECYCLE","vertical":"column-wave"} */
/** COMP-F6339 — notification-rule create/archive must surface rejected writes. */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/const \[ruleError, setRuleError\]/.test(text), "shared rule error state required");
  need(/const createRuleM = useMutation[\s\S]*onMutate: \(\) => setRuleError\(null\)[\s\S]*onError: \(error, input\)[\s\S]*Failed to create notification rule/.test(text), "create failure must be visible");
  need(/const archiveRuleM = useMutation[\s\S]*onMutate: \(\) => setRuleError\(null\)[\s\S]*onError: \(error, input\)[\s\S]*Failed to archive notification rule/.test(text), "archive failure must be visible");
  need(/role="alert"[\s\S]*\{ruleError\}/.test(text), "rule failure must render accessibly");
  need((text.match(/error instanceof Error \? error\.message/g) ?? []).length >= 2, "both actions must preserve backend detail");
  need(/archiveComplianceRule\(input\.id, input\.companyId\)/.test(text), "archive must retain submitted-company scope");
  need(/operating_company_id: input\.companyId[\s\S]*credential_type: input\.credentialType/.test(text), "create must retain submitted company and credential type");
  need((text.match(/input\.generation !== ruleGenerationRef\.current/g) ?? []).length >= 4, "create/archive stale callbacks must be rejected");
  need(/ruleGenerationRef\.current \+= 1;[\s\S]*setRuleCreateOpen\(false\)[\s\S]*createRuleM\.reset\(\)[\s\S]*archiveRuleM\.reset\(\)[\s\S]*\}, \[companyId\]\)/.test(text), "company switch must reset rule actions and modal");
  need(/<Modal[\s\S]*title="Create notification rule"[\s\S]*createRuleM\.mutate\(\{ companyId, generation: ruleGenerationRef\.current, credentialType \}\)/.test(text), "create must use canonical modal and immutable input");
  need(!/window\.prompt\(/.test(text), "native credential prompt remains");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-compliance-notification-rule-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("Failed to create notification rule", "Create failed"),
    source.replace("Failed to archive notification rule", "Archive failed"),
    source.replace(/\n        \{ruleError \? \([\s\S]*?\n        \) : null\}/, ""),
    source.replaceAll("error instanceof Error ? error.message", '"Request failed"'),
    source.replace("archiveComplianceRule(input.id, input.companyId)", "archiveComplianceRule(input.id, '')"),
    source.replaceAll("input.generation !== ruleGenerationRef.current", "false"),
    source.replace("ruleGenerationRef.current += 1;", "ruleGenerationRef.current += 0;"),
    source.replace("<Modal open={ruleCreateOpen}", "<div open={ruleCreateOpen}"),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-compliance-notification-rule-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-compliance-notification-rule-visible-errors PASS — create/archive failures are visible");
