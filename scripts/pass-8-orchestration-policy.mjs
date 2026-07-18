const PASS8_CONTEXT = "pass-8-smoke-verify / pass-8";
const REPORT_JSON = "docs/audits/PASS-8-PRE-PROD-SMOKE-RESULTS.json";
const REPORT_MD = "docs/audits/PASS-8-PRE-PROD-SMOKE-RESULTS.md";

function stepBlock(workflow, stepName) {
  const start = workflow.indexOf(`- name: ${stepName}`);
  if (start < 0) return "";
  const next = workflow.indexOf("\n      - name:", start + 1);
  return workflow.slice(start, next < 0 ? workflow.length : next);
}

export function evaluatePass8Orchestration({
  workflow,
  meta,
  gitignore,
  trackedFiles = [],
}) {
  const violations = [];
  const producer = "run: npm run verify:pass-8-smoke";
  const consumer = "run: npm run verify:pass-8-clean-baseline";
  const producerIndex = workflow.indexOf(producer);
  const consumerIndex = workflow.indexOf(consumer);

  if (producerIndex < 0) violations.push("PASS-8 CI producer step is missing");
  if (consumerIndex < 0) violations.push("PASS-8 CI consumer step is missing");
  if (producerIndex >= 0 && consumerIndex >= 0 && producerIndex >= consumerIndex) {
    violations.push("PASS-8 CI producer must run before consumer");
  }
  if (/continue-on-error:\s*true/.test(stepBlock(workflow, "Run PASS-8 orchestrator"))) {
    violations.push("PASS-8 CI producer failure must block the consumer");
  }

  if (meta.server_required_ci_equivalents?.["pass8-artifact"] !== PASS8_CONTEXT) {
    violations.push(`pass8-artifact must map exactly to ${PASS8_CONTEXT}`);
  }
  if (!(meta.server_required_ci_contexts ?? []).includes(PASS8_CONTEXT)) {
    violations.push(`${PASS8_CONTEXT} must be declared server-required`);
  }
  if (!(meta.non_protection_ci_contexts ?? []).includes(PASS8_CONTEXT)) {
    violations.push(`${PASS8_CONTEXT} must be declared conditional, not protection-required`);
  }
  const wiring = meta.server_required_ci_wiring?.[PASS8_CONTEXT];
  if (
    wiring?.workflow !== ".github/workflows/pass-8-smoke-verify.yml" ||
    wiring?.job !== "pass-8"
  ) {
    violations.push(`${PASS8_CONTEXT} must wire to pass-8-smoke-verify.yml job pass-8`);
  }
  if (
    !(meta.server_required_guard_capabilities?.["verify:pass-8-clean-baseline"] ?? []).includes(
      "pass8-artifact"
    )
  ) {
    violations.push("PASS-8 consumer must explicitly require pass8-artifact capability");
  }

  const ignoredLines = gitignore.split(/\r?\n/);
  for (const report of [REPORT_JSON, REPORT_MD]) {
    const ignored = ignoredLines.some(
      (line) =>
        line === report ||
        (line.endsWith("*") && report.startsWith(line.slice(0, -1)))
    );
    if (!ignored) {
      violations.push(`${report} must remain ignored`);
    }
    if (trackedFiles.includes(report)) {
      violations.push(`${report} must never be committed`);
    }
  }
  return violations;
}

export const PASS8_ORCHESTRATION = Object.freeze({
  context: PASS8_CONTEXT,
  reportJson: REPORT_JSON,
  reportMarkdown: REPORT_MD,
});
