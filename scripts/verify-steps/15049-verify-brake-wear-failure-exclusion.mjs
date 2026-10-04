export default {
  name: "verify:brake-wear-failure-exclusion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-brake-wear-failure-exclusion.mjs"]);
  },
};
