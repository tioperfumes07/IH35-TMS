import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

export function repositorySlugFromRemote(remoteUrl) {
  const value = String(remoteUrl ?? "").trim().replace(/\.git$/, "");
  const match =
    /github\.com[/:]([^/\s]+\/[^/\s]+)$/.exec(value) ??
    /^([^/\s]+\/[^/\s]+)$/.exec(value);
  return match?.[1] ?? null;
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
  } = {}
) {
  const capabilities = Object.keys(declarations ?? {});
  const requiredContexts = new Set();
  const errors = {};
  if (capabilities.length === 0) return { requiredContexts, errors };

  const remote = run("git", ["remote", "get-url", "origin"], {
    cwd: root,
    encoding: "utf8",
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
  });
  if (remote.status !== 0 || remote.error) {
    const message = commandFailure(remote, "git remote lookup");
    for (const capability of capabilities) errors[capability] = message;
    return { requiredContexts, errors };
  }
  const repository = repositorySlugFromRemote(remote.stdout);
  if (!repository) {
    const message = "git remote lookup did not resolve a GitHub owner/repository";
    for (const capability of capabilities) errors[capability] = message;
    return { requiredContexts, errors };
  }

  const rules = run("gh", ["api", `repos/${repository}/rules/branches/main`], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (rules.status !== 0 || rules.error) {
    const message = commandFailure(rules, "live GitHub ruleset lookup");
    for (const capability of capabilities) errors[capability] = message;
    return { requiredContexts, errors };
  }

  let effectiveRules;
  try {
    effectiveRules = JSON.parse(rules.stdout);
    if (!Array.isArray(effectiveRules)) throw new TypeError("response is not an array");
  } catch (error) {
    const message = `live GitHub ruleset lookup returned invalid JSON: ${error.message}`;
    for (const capability of capabilities) errors[capability] = message;
    return { requiredContexts, errors };
  }

  const requiredChecks = effectiveRules
    .filter((rule) => rule?.type === "required_status_checks")
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
