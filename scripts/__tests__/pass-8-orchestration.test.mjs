import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  STATIC_RESULT_CATEGORIES,
  capabilityPreflight,
  classify,
} from "../verify-static.mjs";
import { evaluatePass8Orchestration } from "../pass-8-orchestration-policy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONSUMER = path.join(ROOT, "scripts/verify-pass-8-clean-baseline.mjs");
const CONTEXT = "pass-8-smoke-verify / pass-8";

function makeCapabilityFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pass8-capability-"));
  const scriptsDir = path.join(root, "scripts");
  fs.mkdirSync(scriptsDir);
  const file = path.join(scriptsDir, "verify-pass-8-clean-baseline.mjs");
  fs.writeFileSync(file, 'console.error("consumer must not run"); process.exit(1);');
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      scripts: {
        "verify:pass-8-clean-baseline":
          "node scripts/verify-pass-8-clean-baseline.mjs",
      },
    })
  );
  return {
    root,
    file,
    policy: {
      dbGated: new Set(),
      equivalents: { "pass8-artifact": CONTEXT },
      serverRequiredContexts: new Set([CONTEXT]),
      nonProtectionContexts: new Set([CONTEXT]),
      requiredContexts: new Set(),
      wiredContexts: new Set([CONTEXT]),
      guardCapabilities: {
        "verify:pass-8-clean-baseline": ["pass8-artifact"],
      },
    },
  };
}

function validMeta() {
  return {
    server_required_ci_equivalents: { "pass8-artifact": CONTEXT },
    server_required_ci_contexts: [CONTEXT],
    non_protection_ci_contexts: [CONTEXT],
    server_required_ci_wiring: {
      [CONTEXT]: {
        workflow: ".github/workflows/pass-8-smoke-verify.yml",
        job: "pass-8",
      },
    },
    server_required_guard_capabilities: {
      "verify:pass-8-clean-baseline": ["pass8-artifact"],
    },
  };
}

const orderedWorkflow = `
jobs:
  pass-8:
    steps:
      - name: Run PASS-8 orchestrator
        run: npm run verify:pass-8-smoke
      - name: Verify PASS-8 clean baseline
        run: npm run verify:pass-8-clean-baseline
`;

test("absent generated artifact is an exact PASS-8 capability skip, not consumer noise", () => {
  const fixture = makeCapabilityFixture();
  const preflight = capabilityPreflight(fixture.file, {
    root: fixture.root,
    dependenciesAvailable: true,
    databaseAvailable: true,
    capabilityAvailability: { "pass8-artifact": false },
    policy: fixture.policy,
  });
  const result = classify(fixture.file, { preflight });
  assert.equal(result.kind, STATIC_RESULT_CATEGORIES.SKIP_CAPABILITY);
  assert.equal(result.detail, `pass8-artifact → ${CONTEXT}`);

  const direct = spawnSync(process.execPath, [CONSUMER], {
    cwd: fixture.root,
    encoding: "utf8",
  });
  assert.notEqual(direct.status, 0, "consumer-only execution must not false-pass");
  assert.match(direct.stderr, /missing report/);
});

test("producer failure is blocking and cannot continue to consumer", () => {
  const workflow = orderedWorkflow.replace(
    "- name: Run PASS-8 orchestrator",
    "- name: Run PASS-8 orchestrator\n        continue-on-error: true"
  );
  const violations = evaluatePass8Orchestration({
    workflow,
    meta: validMeta(),
    gitignore: "docs/audits/PASS-8-PRE-PROD-SMOKE-RESULTS.*",
  });
  assert.ok(violations.some((item) => item.includes("producer failure must block")));
});

test("valid generated artifact is consumed successfully without committing it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pass8-valid-report-"));
  const auditDir = path.join(root, "docs/audits");
  fs.mkdirSync(auditDir, { recursive: true });
  fs.writeFileSync(
    path.join(auditDir, "PASS-8-PRE-PROD-SMOKE-RESULTS.json"),
    JSON.stringify({
      overall_status: "PASS",
      recommendation: "PROCEED",
      areas: [{ area: "fixture", status: "PASS" }],
    })
  );
  const result = spawnSync(process.execPath, [CONSUMER], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS/);
});

test("missing or unclassified PASS-8 CI equivalent hard-fails capability classification", () => {
  const fixture = makeCapabilityFixture();
  for (const policy of [
    { ...fixture.policy, equivalents: {} },
    { ...fixture.policy, nonProtectionContexts: new Set() },
  ]) {
    const preflight = capabilityPreflight(fixture.file, {
      root: fixture.root,
      dependenciesAvailable: true,
      databaseAvailable: true,
      capabilityAvailability: { "pass8-artifact": false },
      policy,
    });
    const result = classify(fixture.file, { preflight });
    assert.equal(result.kind, STATIC_RESULT_CATEGORIES.FAIL_TEST);
  }
});

test("CI PASS-8 producer runs before consumer", () => {
  const good = evaluatePass8Orchestration({
    workflow: orderedWorkflow,
    meta: validMeta(),
    gitignore: "docs/audits/PASS-8-PRE-PROD-SMOKE-RESULTS.*",
  });
  assert.deepEqual(good, []);

  const reversed = orderedWorkflow.replace(
    /(\s+- name: Run PASS-8 orchestrator[\s\S]*?verify:pass-8-smoke)([\s\S]*?)(\s+- name: Verify PASS-8 clean baseline[\s\S]*?verify:pass-8-clean-baseline)/,
    "$3$2$1"
  );
  const bad = evaluatePass8Orchestration({
    workflow: reversed,
    meta: validMeta(),
    gitignore: "docs/audits/PASS-8-PRE-PROD-SMOKE-RESULTS.*",
  });
  assert.ok(bad.some((item) => item.includes("producer must run before consumer")));
});
