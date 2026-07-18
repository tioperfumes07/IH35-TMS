import assert from "node:assert/strict";
import test from "node:test";
import financeLandingStep, {
  FINANCE_LANDING_CORE_CHECKS,
  runFinanceLandingCoreChecks,
} from "../verify-steps/907-verify-finance-landing-hub.mjs";
import { runStep } from "../verify-steps/_runner.mjs";

function runWithStatuses(statuses) {
  const calls = [];
  const failures = runFinanceLandingCoreChecks({
    run(command, args) {
      calls.push([command, args]);
      return statuses[calls.length - 1] ?? 0;
    },
  });
  return { calls, failures };
}

test("aggregate step executes guard, selftest, and behavioral route test", () => {
  const { calls, failures } = runWithStatuses([0, 0, 0]);

  assert.deepEqual(failures, []);
  assert.deepEqual(
    calls,
    FINANCE_LANDING_CORE_CHECKS.map(({ command, args }) => [command, args]),
  );
});

for (const [index, check] of FINANCE_LANDING_CORE_CHECKS.entries()) {
  test(`aggregate step fails closed when ${check.label} fails`, () => {
    const statuses = FINANCE_LANDING_CORE_CHECKS.map((_, candidate) =>
      candidate === index ? 17 : 0
    );
    const { calls, failures } = runWithStatuses(statuses);

    assert.equal(calls.length, FINANCE_LANDING_CORE_CHECKS.length);
    assert.deepEqual(failures, [check.label]);
  });
}

test("current aggregate runner rejects a planted behavioral-test failure", async () => {
  const calls = [];
  const statuses = [0, 0, 23, 0];
  const ctx = {
    run(command, args) {
      calls.push([command, args]);
      return statuses[calls.length - 1] ?? 0;
    },
  };

  await assert.rejects(
    runStep({
      index: 1,
      total: 1,
      name: financeLandingStep.name,
      run: () => financeLandingStep.run(ctx),
    }),
    /behavioral route test/,
  );
  assert.equal(calls.length, FINANCE_LANDING_CORE_CHECKS.length + 1);
});
