export default {
  name: "verify:safety-hos-violations-error-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-hos-violations-error-state.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-hos-violations-error-state.mjs"]);
  },
};
