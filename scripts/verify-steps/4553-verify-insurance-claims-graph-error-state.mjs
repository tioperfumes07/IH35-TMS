export default {
  name: "verify:insurance-claims-graph-error-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-claims-graph-error-state.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-insurance-claims-graph-error-state.mjs"]);
  },
};
