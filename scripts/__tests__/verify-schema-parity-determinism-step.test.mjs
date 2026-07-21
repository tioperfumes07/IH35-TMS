import assert from "node:assert/strict";
import test from "node:test";
import step from "../verify-steps/145-verify-schema-parity-determinism.mjs";

test("verify step rejects immediately when the normal guard returns status 1", () => {
  const calls = [];
  const ctx = {
    runAllowFailure(command, args) {
      calls.push([command, args]);
      return 1;
    },
  };

  assert.throws(
    () => step.run(ctx),
    /verify-schema-parity-determinism failed with status 1/,
  );
  assert.deepEqual(calls, [
    ["node", ["scripts/verify-schema-parity-determinism.mjs"]],
  ]);
});

test("verify step stops before the wrapper test when selftest fails", () => {
  const calls = [];
  const statuses = [0, 1];
  const ctx = {
    runAllowFailure(command, args) {
      calls.push([command, args]);
      return statuses.shift();
    },
  };

  assert.throws(
    () => step.run(ctx),
    /verify-schema-parity-determinism --selftest failed with status 1/,
  );
  assert.deepEqual(calls, [
    ["node", ["scripts/verify-schema-parity-determinism.mjs"]],
    ["node", ["scripts/verify-schema-parity-determinism.mjs", "--selftest"]],
  ]);
});

test("verify step rejects when the actual wrapper test returns status 1", () => {
  const calls = [];
  const statuses = [0, 0, 1];
  const ctx = {
    runAllowFailure(command, args) {
      calls.push([command, args]);
      return statuses.shift();
    },
  };

  assert.throws(
    () => step.run(ctx),
    /verify-schema-parity-determinism step test failed with status 1/,
  );
  assert.deepEqual(calls, [
    ["node", ["scripts/verify-schema-parity-determinism.mjs"]],
    ["node", ["scripts/verify-schema-parity-determinism.mjs", "--selftest"]],
    ["node", ["--test", "scripts/__tests__/verify-schema-parity-determinism-step.test.mjs"]],
  ]);
});

test("verify step runs normal, selftest, then the actual wrapper test", () => {
  const calls = [];
  const statuses = [0, 0, 0];
  const ctx = {
    runAllowFailure(command, args) {
      calls.push([command, args]);
      return statuses.shift();
    },
  };

  assert.equal(step.run(ctx), 0);
  assert.deepEqual(calls, [
    ["node", ["scripts/verify-schema-parity-determinism.mjs"]],
    ["node", ["scripts/verify-schema-parity-determinism.mjs", "--selftest"]],
    ["node", ["--test", "scripts/__tests__/verify-schema-parity-determinism-step.test.mjs"]],
  ]);
});
