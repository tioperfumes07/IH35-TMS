export const FINANCE_LANDING_CORE_CHECKS = [
  {
    label: "guard",
    command: "node",
    args: ["scripts/verify-finance-landing-hub.mjs"],
  },
  {
    label: "guard selftest",
    command: "node",
    args: ["scripts/verify-finance-landing-hub.mjs", "--selftest"],
  },
  {
    label: "finance hub surfaces S01..S08 ratchet",
    command: "node",
    args: ["scripts/verify-finance-hub-surfaces-s01-s08.mjs"],
  },
  {
    label: "finance hub surfaces S01..S08 selftest",
    command: "node",
    args: ["scripts/verify-finance-hub-surfaces-s01-s08.mjs", "--selftest"],
  },
  {
    label: "behavioral route test",
    command: "npx",
    args: [
      "vitest",
      "run",
      "--config",
      "vitest.config.ts",
      "--root",
      "apps/frontend",
      "src/routes/__tests__/finance-landing-route.test.tsx",
    ],
  },
  {
    label: "architectural route-literal selftest",
    command: "npx",
    args: [
      "tsx",
      "scripts/verify-architectural-design.ts",
      "--selftest-route-sources",
    ],
  },
  {
    label: "navigation route-literal selftest",
    command: "node",
    args: [
      "scripts/verify-nav-integrity.mjs",
      "--selftest-finance-routes",
    ],
  },
];

export function runFinanceLandingCoreChecks(ctx) {
  const failures = [];
  for (const check of FINANCE_LANDING_CORE_CHECKS) {
    if (ctx.run(check.command, check.args) !== 0) {
      failures.push(check.label);
    }
  }
  return failures;
}

export default {
  name: "verify-finance-landing-hub",
  run(ctx) {
    const failures = runFinanceLandingCoreChecks(ctx);
    if (
      ctx.run("node", [
        "--test",
        "scripts/__tests__/verify-finance-landing-hub-step.test.mjs",
      ]) !== 0
    ) {
      failures.push("aggregate wiring selftest");
    }
    if (failures.length > 0) {
      throw new Error(
        `verify-finance-landing-hub failed: ${failures.join(", ")}`,
      );
    }
  },
};
