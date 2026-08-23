export default {
  name: "verify:insurance-policy-claims-error-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-policy-claims-error-state.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-insurance-policy-claims-error-state.mjs"]);
  },
};
