export default {
  name: "verify:safety-gated-batch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-gated-batch.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-gated-batch.mjs"]);
  },
};
