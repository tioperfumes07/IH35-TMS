export default {
  name: "verify:pre-settlement-panel-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pre-settlement-panel-labels.mjs"]);
  },
};
