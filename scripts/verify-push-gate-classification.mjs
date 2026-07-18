#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runExecutableGuard } from "./guard-executable-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = Object.freeze({
  precheck: "scripts/branch-precheck-push.mjs",
  manifest: "scripts/block-ready-agent-manifest.mjs",
  precommit: "scripts/verify-pre-commit.mjs",
  capabilityPolicy: "scripts/push-gate-capability-policy.mjs",
  freshness: "scripts/verify-branch-fresh.mjs",
  staticRunner: "scripts/verify-static.mjs",
  verifyMeta: "scripts/verify-meta.json",
  policyVerifier: "scripts/verify-ci-policy-applied.mjs",
  protection: ".github/branch-protection-config.json",
  requiredChecks: ".github/workflows/required-checks.yml",
  standards: ".claude/skills/ih35-tms-standards/SKILL.md",
  verificationSkill: ".claude/skills/ih35-guard-verification/SKILL.md",
  precheckTests: "scripts/__tests__/branch-precheck-push.test.mjs",
  manifestTests: "scripts/__tests__/block-ready.test.mjs",
  staticTests: "scripts/__tests__/verify-static-classification.test.mjs",
  freshnessTests: "scripts/__tests__/verify-branch-fresh-fallback.test.mjs",
  policyTests: "scripts/__tests__/verify-ci-policy-applied.test.mjs",
});

function loadRepositoryFixture() {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, relativePath]) => [
      key,
      fs.readFileSync(path.join(ROOT, relativePath), "utf8"),
    ])
  );
}

export function checkPushGateClassification(fixture) {
  const violations = [];
  const requireMatch = (key, pattern, message) => {
    if (!pattern.test(fixture[key] ?? "")) violations.push(message);
  };
  const forbidMatch = (key, pattern, message) => {
    if (pattern.test(fixture[key] ?? "")) violations.push(message);
  };

  for (const category of ["DIRTY", "CONFLICT", "FRESHNESS", "CAPABILITY", "TEST"]) {
    requireMatch("precheck", new RegExp(`${category}:\\s*"`), `precheck missing ${category} category`);
  }
  requireMatch("precheck", /status", "--porcelain"/, "precheck does not hard-fail dirty trees");
  requireMatch("precheck", /diff", "--name-only", "--diff-filter=U"/, "precheck does not detect conflicts");
  requireMatch("precheck", /preflightStep/, "precheck lacks explicit capability preflight");
  requireMatch(
    "precheck",
    /serverRequiredCiEquivalent: "ci \/ build-typecheck"/,
    "precheck capability skip lacks named server-required CI equivalent"
  );

  requireMatch("manifest", /BLOCK_ID=.*requires exact manifest/, "explicit BLOCK_ID is not fail-closed");
  requireMatch("manifest", /manifest\.branch === branch/, "manifest resolution is not exact-branch based");
  requireMatch("manifest", /ambiguous exact branch/, "ambiguous branch manifests are not rejected");
  requireMatch("manifest", /GITHUB_HEAD_REF/, "detached CI head branch context is not resolved");
  requireMatch("manifest", /allowAggregate/, "detached aggregate manifest mode is missing");
  forbidMatch("manifest", /AGENT_MANIFEST_REGISTRY|legacyManifest/, "stale legacy manifest fallback remains");
  requireMatch(
    "precommit",
    /allowAggregate:\s*true/,
    "verify-pre-commit does not opt into detached aggregate mode"
  );

  requireMatch("freshness", /DEFAULT_MAX_COMMITS_BEHIND = 0/, "freshness threshold is not zero");
  requireMatch("freshness", /"rev-list", "--count"/, "freshness does not use rev-list count");
  requireMatch("freshness", /\$\{baseSha\}\.\.\$\{mainRef\}/, "freshness is not full-tree");
  forbidMatch("freshness", /ALLOWLIST_PATHS/, "freshness still uses a path allowlist");

  requireMatch("staticRunner", /capabilityPreflight/, "static gate lacks capability preflight");
  requireMatch("staticRunner", /SKIP-capability/, "static gate lacks structured capability skip");
  requireMatch("staticRunner", /FAIL-test/, "static gate lacks structured hard-test failure");
  forbidMatch("staticRunner", /DB_NEEDED_RE|ENV_NEEDED_RE/, "static gate still classifies by error text");
  requireMatch(
    "verifyMeta",
    /"server_required_ci_equivalents"/,
    "capability skips lack named server-required CI equivalents"
  );
  for (const marker of [
    "serverRequiredContexts",
    "requiredContexts",
    "wiredContexts",
  ]) {
    requireMatch(
      "capabilityPolicy",
      new RegExp(marker),
      `capability policy does not prove ${marker}`
    );
  }

  const protection = (() => {
    try {
      return JSON.parse(fixture.protection);
    } catch {
      return null;
    }
  })();
  if (protection?.protection?.required_status_checks?.strict !== true) {
    violations.push("committed branch protection does not require strict freshness");
  }
  if (
    !protection?.protection?.required_status_checks?.contexts?.includes("ci / verify-branch-fresh")
  ) {
    violations.push("committed branch protection omits strict freshness context");
  }
  requireMatch(
    "policyVerifier",
    /STRICT_FRESHNESS_CONTEXT = "ci \/ verify-branch-fresh"/,
    "policy verifier does not require strict freshness context"
  );
  requireMatch(
    "policyVerifier",
    /strict freshness is disabled/,
    "policy verifier does not fail live strictness drift"
  );
  requireMatch(
    "policyVerifier",
    /\["GH_ADMIN_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"\]/,
    "policy verifier does not use available read-token fallback order"
  );
  requireMatch(
    "policyVerifier",
    /BLOCKED-UNVERIFIED/,
    "policy verifier does not block unverifiable CI enforcement"
  );
  forbidMatch(
    "policyVerifier",
    /PASS \(baseline\)/,
    "policy verifier still reports success without live verification"
  );
  requireMatch(
    "requiredChecks",
    /'ci \/ verify-branch-fresh'/,
    "required-checks safety net omits freshness context"
  );

  forbidMatch("standards", /with `--no-verify`/, "standards still give blanket no-verify guidance");
  forbidMatch(
    "verificationSkill",
    /push\s*\n?`--no-verify`/,
    "verification skill still gives blanket no-verify guidance"
  );

  requireMatch("precheckTests", /hard dirty failure/, "dirty-tree planted test missing");
  requireMatch("precheckTests", /hard conflict failure/, "conflict planted test missing");
  requireMatch("manifestTests", /ambiguous exact branch/, "ambiguous-manifest planted test missing");
  requireMatch("manifestTests", /wrong explicit BLOCK_ID/, "wrong-manifest planted test missing");
  requireMatch("staticTests", /missing database/, "missing-DB classification test missing");
  requireMatch("staticTests", /missing dependencies/, "missing-deps classification test missing");
  requireMatch("staticTests", /DATABASE_URL text/, "DATABASE_URL false-classification test missing");
  requireMatch("freshnessTests", /one behind commit anywhere/, "stale-branch planted test missing");
  requireMatch("freshnessTests", /shell-like refs/, "unsafe-ref planted test missing");
  requireMatch("policyTests", /live ruleset drift/, "live-ruleset-drift planted test missing");
  requireMatch("policyTests", /blocking unverified/, "missing-token planted test missing");
  requireMatch("manifestTests", /detached GitHub Actions/, "detached-head CI fixture missing");
  requireMatch("staticTests", /not wired/, "capability wiring drift fixture missing");
  requireMatch("freshness", /spawnSync\("git", args/, "freshness does not use git argument arrays");
  forbidMatch("freshness", /execSync|shell:\s*true/, "freshness still uses shell command execution");

  return violations;
}

const goodFixture = {
  precheck:
    'DIRTY: "dirty", CONFLICT: "conflict", FRESHNESS: "freshness", CAPABILITY: "capability", TEST: "test"; ["status", "--porcelain"]; ["diff", "--name-only", "--diff-filter=U"]; preflightStep(); serverRequiredCiEquivalent: "ci / build-typecheck";',
  manifest:
    'throw new Error(`BLOCK_ID=${blockId} requires exact manifest`); manifest.branch === branch; "ambiguous exact branch"; GITHUB_HEAD_REF; allowAggregate;',
  precommit: "allowAggregate: true",
  capabilityPolicy: "serverRequiredContexts requiredContexts wiredContexts",
  freshness:
    'const DEFAULT_MAX_COMMITS_BEHIND = 0; spawnSync("git", args); ["rev-list", "--count", `${baseSha}..${mainRef}`];',
  staticRunner: 'capabilityPreflight(); "SKIP-capability"; "FAIL-test";',
  verifyMeta: '{"server_required_ci_equivalents":{}}',
  policyVerifier:
    'const STRICT_FRESHNESS_CONTEXT = "ci / verify-branch-fresh"; "strict freshness is disabled"; ["GH_ADMIN_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"]; "BLOCKED-UNVERIFIED";',
  protection: JSON.stringify({
    protection: {
      required_status_checks: { strict: true, contexts: ["ci / verify-branch-fresh"] },
    },
  }),
  requiredChecks: "'ci / verify-branch-fresh'",
  standards: "push gates fail closed",
  verificationSkill: "push gates fail closed",
  precheckTests: "hard dirty failure; hard conflict failure",
  manifestTests: "ambiguous exact branch; wrong explicit BLOCK_ID; detached GitHub Actions",
  staticTests: "missing database; missing dependencies; DATABASE_URL text; not wired",
  freshnessTests: "one behind commit anywhere; shell-like refs",
  policyTests: "live ruleset drift; blocking unverified",
};
const badFixture = {
  ...goodFixture,
  manifest: "legacyManifest AGENT_MANIFEST_REGISTRY",
  protection: "{}",
  freshness: 'execSync("git rev-list")',
};

runExecutableGuard({
  label: "verify-push-gate-classification",
  checker: checkPushGateClassification,
  loadRepositoryFixture,
  goodFixture,
  badFixture,
  expectedBadViolationSubstrings: ["legacy manifest fallback", "strict freshness"],
});
