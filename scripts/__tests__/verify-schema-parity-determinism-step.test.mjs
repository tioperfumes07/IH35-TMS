import assert from "node:assert/strict";
import test from "node:test";
import step from "../verify-steps/145-verify-schema-parity-determinism.mjs";

test("verify step rejects immediately when the normal guard returns status 1", () => {
  const calls = [];
  const ctx = {
    run(command, args) {
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

test("verify step runs selftest only after the normal guard succeeds", () => {
  const calls = [];
  const statuses = [0, 0];
  const ctx = {
    run(command, args) {
      calls.push([command, args]);
      return statuses.shift();
    },
  };

  assert.equal(step.run(ctx), 0);
  assert.deepEqual(calls, [
    ["node", ["scripts/verify-schema-parity-determinism.mjs"]],
    ["node", ["scripts/verify-schema-parity-determinism.mjs", "--selftest"]],
  ]);
});
