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
    return 0;
  },
};
