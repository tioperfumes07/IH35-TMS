import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { sanitizeTrustedProcessEnvironment } from "./trusted-git-environment.mjs";

export const TRUSTED_GITHUB_AUTHORITY = Object.freeze({
  host: "github.com",
  repository: "tioperfumes07/IH35-TMS",
  branch: "main",
  // The ID is the trust anchor. It is immutable for the life of the ruleset and is what proves we are
  // reading the authority we think we are. The NAME is corroborating detail a human can change in the
  // GitHub UI at any time.
  rulesetId: 17935054,
  // Accepted names for ruleset 17935054, newest first. The owner renamed it from "hold-merge-gate" to
  // "require-up-to-date-main" on 2026-08-05 while enabling "require branches to be up to date before
  // merging". Because the pin matched on name AS WELL AS id, a rename that changed nothing about the
  // ruleset's authority failed the identity check and blocked the push gate for every branch that
  // reaches this capability probe — a policy improvement locked all four lanes out, and migration
  // branches hit it first because they exercise this path.
  //
  // A LIST, deliberately, not a swap: replacing one hardcoded string with another breaks again on the
  // next rename, and dropping the name check would weaken the anchor. Both names refer to the same
  // immutable id, so both stay valid; a ruleset with a DIFFERENT id is still rejected.
  rulesetNames: Object.freeze(["require-up-to-date-main", "hold-merge-gate"]),
});

function workflowDeclaresJob(root, wiring) {
  if (!wiring || typeof wiring.workflow !== "string" || typeof wiring.job !== "string") {
    return false;
  }
  const workflowPath = path.resolve(root, wiring.workflow);
  if (!fs.existsSync(workflowPath)) return false;
  const source = fs.readFileSync(workflowPath, "utf8");
  const escaped = wiring.job.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^  ${escaped}:\\s*$`, "m").test(source);
}

function commandFailure(result, label) {
  if (result.error) {
    return `${label} failed: ${result.error.code ?? result.error.name}: ${result.error.message}`;
  }
  const detail = String(result.stderr || result.stdout || "").trim();
  return `${label} failed with exit ${result.status}${detail ? `: ${detail}` : ""}`;
}

export function loadLiveRequiredStatusChecks(
  root,
  declarations,
  {
    run = (command, args, options) => spawnSync(command, args, options),
    sourceEnv = process.env,
  } = {}
) {
  const capabilities = Object.keys(declarations ?? {});
  const requiredContexts = new Set();
  const errors = {};
  if (capabilities.length === 0) return { requiredContexts, errors };

  let trustedEnv;
  try {
    trustedEnv = sanitizeTrustedProcessEnvironment(root, { run, sourceEnv }).env;
  } catch (error) {
    const message = error.message;
    for (const capability of capabilities) errors[capability] = message;
    return { requiredContexts, errors };
  }

  const rules = run("gh", [
    "api",
    "--hostname",
    TRUSTED_GITHUB_AUTHORITY.host,
    `repos/${TRUSTED_GITHUB_AUTHORITY.repository}/rules/branches/${TRUSTED_GITHUB_AUTHORITY.branch}`,
  ], {
    cwd: root,
    env: trustedEnv,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (rules.status !== 0 || rules.error) {
    const message = commandFailure(rules, "live GitHub ruleset lookup");
    for (const capability of capabilities) errors[capability] = message;
    return { requiredContexts, errors };
  }

  const ruleset = run("gh", [
    "api",
    "--hostname",
    TRUSTED_GITHUB_AUTHORITY.host,
    `repos/${TRUSTED_GITHUB_AUTHORITY.repository}/rulesets/${TRUSTED_GITHUB_AUTHORITY.rulesetId}`,
  ], {
    cwd: root,
    env: trustedEnv,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (ruleset.status !== 0 || ruleset.error) {
    const message = commandFailure(ruleset, "live GitHub ruleset identity lookup");
    for (const capability of capabilities) errors[capability] = message;
    return { requiredContexts, errors };
  }

  let effectiveRules;
  let rulesetIdentity;
  try {
    effectiveRules = JSON.parse(rules.stdout);
    if (!Array.isArray(effectiveRules)) throw new TypeError("response is not an array");
    rulesetIdentity = JSON.parse(ruleset.stdout);
    if (!rulesetIdentity || Array.isArray(rulesetIdentity)) {
      throw new TypeError("ruleset identity response is not an object");
    }
  } catch (error) {
    const message = `live GitHub ruleset lookup returned invalid JSON: ${error.message}`;
    for (const capability of capabilities) errors[capability] = message;
    return { requiredContexts, errors };
  }

  const identityMatches =
    Number(rulesetIdentity.id) === TRUSTED_GITHUB_AUTHORITY.rulesetId &&
    TRUSTED_GITHUB_AUTHORITY.rulesetNames.includes(rulesetIdentity.name) &&
    rulesetIdentity.source_type === "Repository" &&
    rulesetIdentity.source === TRUSTED_GITHUB_AUTHORITY.repository &&
    rulesetIdentity.target === "branch" &&
    rulesetIdentity.enforcement === "active";
  if (!identityMatches) {
    const message =
      `live GitHub ruleset identity does not match active repository ruleset ` +
      `${TRUSTED_GITHUB_AUTHORITY.repository}#${TRUSTED_GITHUB_AUTHORITY.rulesetId}`;
    for (const capability of capabilities) errors[capability] = message;
    return { requiredContexts, errors };
  }

  const requiredChecks = effectiveRules
    .filter(
      (rule) =>
        rule?.type === "required_status_checks" &&
        rule?.ruleset_source_type === "Repository" &&
        rule?.ruleset_source === TRUSTED_GITHUB_AUTHORITY.repository &&
        Number(rule?.ruleset_id) === TRUSTED_GITHUB_AUTHORITY.rulesetId
    )
    .flatMap((rule) => rule?.parameters?.required_status_checks ?? []);
  for (const [capability, declaration] of Object.entries(declarations)) {
    const exact = requiredChecks.some(
      (check) =>
        check?.context === declaration.check_context &&
        Number(check?.integration_id) === Number(declaration.integration_id)
    );
    if (exact) requiredContexts.add(declaration.context);
    else {
      errors[capability] =
        `live GitHub rules for main do not require ${declaration.check_context} ` +
        `from integration ${declaration.integration_id}`;
    }
  }
  return { requiredContexts, errors };
}

export function loadCapabilityPolicy(root, options = {}) {
  const meta = JSON.parse(
    fs.readFileSync(path.resolve(root, "scripts/verify-meta.json"), "utf8")
  );
  const protection = JSON.parse(
    fs.readFileSync(path.resolve(root, ".github/branch-protection-config.json"), "utf8")
  );
  const wiring = meta.server_required_ci_wiring ?? {};
  const liveDeclarations = meta.server_required_live_status_checks ?? {};
  const live = loadLiveRequiredStatusChecks(root, liveDeclarations, options);
  return {
    equivalents: meta.server_required_ci_equivalents ?? {},
    serverRequiredContexts: new Set(meta.server_required_ci_contexts ?? []),
    nonProtectionContexts: new Set(meta.non_protection_ci_contexts ?? []),
    requiredContexts: new Set(
      protection.protection?.required_status_checks?.contexts ?? []
    ),
    wiredContexts: new Set(
      Object.entries(wiring)
        .filter(([, declaration]) => workflowDeclaresJob(root, declaration))
        .map(([context]) => context)
    ),
    liveRequiredCapabilities: new Set(Object.keys(liveDeclarations)),
    liveRequiredContexts: live.requiredContexts,
    liveVerificationErrors: live.errors,
    dbGated: new Set(meta.db_gated_verify_scripts ?? []),
    guardCapabilities: meta.server_required_guard_capabilities ?? {},
  };
}

export function validateCapabilityEquivalent(capability, context, policy) {
  const violations = [];
  const declared = policy.equivalents?.[capability];
  if (!declared) {
    violations.push(`capability "${capability}" has no declared CI equivalent`);
    return violations;
  }
  if (declared !== context) {
    violations.push(
      `capability "${capability}" declares "${declared}", not requested "${context}"`
    );
  }
  if (!policy.serverRequiredContexts?.has(context)) {
    violations.push(`CI equivalent "${context}" is not declared server-required`);
  }
  const intentionallyConditional = policy.nonProtectionContexts?.has(context);
  const requiresLiveProof = policy.liveRequiredCapabilities?.has(capability);
  if (
    !intentionallyConditional &&
    requiresLiveProof &&
    !policy.liveRequiredContexts?.has(context)
  ) {
    violations.push(
      policy.liveVerificationErrors?.[capability] ??
        `CI equivalent "${context}" is not required by live GitHub rules`
    );
  } else if (
    !intentionallyConditional &&
    !requiresLiveProof &&
    !policy.requiredContexts?.has(context)
  ) {
    violations.push(`CI equivalent "${context}" is not a required protection context`);
  }
  if (intentionallyConditional && policy.requiredContexts?.has(context)) {
    violations.push(`conditional CI equivalent "${context}" must not be a required protection context`);
  }
  if (!policy.wiredContexts?.has(context)) {
    violations.push(`CI equivalent "${context}" is not wired to its declared workflow job`);
  }
  return violations;
}

export function validateCapabilitySkip(missing, context, policy) {
  return missing.flatMap((capability) =>
    validateCapabilityEquivalent(capability, context, policy)
  );
}
