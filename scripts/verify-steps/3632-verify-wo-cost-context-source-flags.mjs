// verify-steps wrapper — LV-WO-COST-CONTEXT-SILENTLY-MISSING-SOURCES · claim 3632
export default {
  name: "verify-wo-cost-context-source-flags",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-cost-context-source-flags.mjs"]);
  },
};
