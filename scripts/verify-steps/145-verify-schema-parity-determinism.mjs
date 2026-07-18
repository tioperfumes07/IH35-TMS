export default {
  name: "verify-schema-parity-determinism",
  run(ctx) {
    const normalStatus = ctx.run("node", ["scripts/verify-schema-parity-determinism.mjs"]);
    if (normalStatus !== 0) {
      throw new Error(`verify-schema-parity-determinism failed with status ${normalStatus}`);
    }

    const selftestStatus = ctx.run("node", ["scripts/verify-schema-parity-determinism.mjs", "--selftest"]);
    if (selftestStatus !== 0) {
      throw new Error(`verify-schema-parity-determinism --selftest failed with status ${selftestStatus}`);
    }

    const wrapperTestStatus = ctx.run("node", [
      "--test",
      "scripts/__tests__/verify-schema-parity-determinism-step.test.mjs",
    ]);
    if (wrapperTestStatus !== 0) {
      throw new Error(`verify-schema-parity-determinism step test failed with status ${wrapperTestStatus}`);
    }
    return 0;
  },
};
