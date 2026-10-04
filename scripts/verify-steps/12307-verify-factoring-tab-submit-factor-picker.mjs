export default {
  name: "verify:factoring-tab-submit-factor-picker",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-tab-submit-factor-picker.mjs"]);
  },
};
