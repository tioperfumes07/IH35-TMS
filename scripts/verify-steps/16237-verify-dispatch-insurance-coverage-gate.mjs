export default {
  name: "verify:dispatch-insurance-coverage-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-insurance-coverage-gate.mjs"]);
  },
};
