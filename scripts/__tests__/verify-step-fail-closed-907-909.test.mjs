import assert from "node:assert/strict";
import test from "node:test";

import invoiceStep from "../verify-steps/907-verify-invoice-pickup-sort.mjs";
import qboStep from "../verify-steps/909-verify-qbo-sync-staleness.mjs";

for (const [label, step] of [
  ["invoice pickup sort", invoiceStep],
  ["QBO sync staleness", qboStep],
]) {
  test(`${label} wrapper throws when the primary guard returns nonzero`, () => {
    assert.throws(() => step.run({ run: () => 1 }), /failed/);
  });

  test(`${label} wrapper throws when the planted-failure selftest returns nonzero`, () => {
    let invocation = 0;
    assert.throws(
      () =>
        step.run({
          run() {
            invocation += 1;
            return invocation === 1 ? 0 : 1;
          },
        }),
      /selftest failed/,
    );
  });

  test(`${label} wrapper runs primary and selftest on success`, () => {
    const calls = [];
    step.run({
      run(command, args) {
        calls.push([command, args]);
        return 0;
      },
    });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], ["node", [calls[0][1][0], "--selftest"]]);
  });
}
