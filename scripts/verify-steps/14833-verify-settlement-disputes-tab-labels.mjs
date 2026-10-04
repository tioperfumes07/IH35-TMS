export default {
  name: "verify:settlement-disputes-tab-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-disputes-tab-labels.mjs"]);
  },
};
