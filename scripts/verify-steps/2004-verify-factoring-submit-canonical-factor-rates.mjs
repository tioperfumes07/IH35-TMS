export default {
  name: "verify:factoring-submit-canonical-factor-rates",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-submit-canonical-factor-rates.mjs"]);
  },
};
