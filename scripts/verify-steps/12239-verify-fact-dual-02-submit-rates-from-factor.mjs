export default {
  name: "verify:fact-dual-02-submit-rates-from-factor",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fact-dual-02-submit-rates-from-factor.mjs"]);
  },
};
