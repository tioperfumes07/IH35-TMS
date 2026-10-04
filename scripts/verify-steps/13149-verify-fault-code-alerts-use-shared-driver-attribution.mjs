export default {
  name: "verify:fault-code-alerts-use-shared-driver-attribution",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fault-code-alerts-use-shared-driver-attribution.mjs"]);
  },
};
