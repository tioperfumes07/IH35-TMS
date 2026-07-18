import fs from "node:fs";
import path from "node:path";

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

export function loadCapabilityPolicy(root) {
  const meta = JSON.parse(
    fs.readFileSync(path.resolve(root, "scripts/verify-meta.json"), "utf8")
  );
  const protection = JSON.parse(
    fs.readFileSync(path.resolve(root, ".github/branch-protection-config.json"), "utf8")
  );
  const wiring = meta.server_required_ci_wiring ?? {};
  return {
    equivalents: meta.server_required_ci_equivalents ?? {},
    serverRequiredContexts: new Set(meta.server_required_ci_contexts ?? []),
    requiredContexts: new Set(
      protection.protection?.required_status_checks?.contexts ?? []
    ),
    wiredContexts: new Set(
      Object.entries(wiring)
        .filter(([, declaration]) => workflowDeclaresJob(root, declaration))
        .map(([context]) => context)
    ),
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
  if (!policy.requiredContexts?.has(context)) {
    violations.push(`CI equivalent "${context}" is not a required protection context`);
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
