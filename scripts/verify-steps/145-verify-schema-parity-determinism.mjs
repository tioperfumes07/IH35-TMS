export default {
  name: "verify-schema-parity-determinism",
  run(ctx) {
    ctx.run("node", ["scripts/verify-schema-parity-determinism.mjs"]);
    return ctx.run("node", ["scripts/verify-schema-parity-determinism.mjs", "--selftest"]);
  },
};
