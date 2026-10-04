export default {
  name: "verify:tire-wear-failure-exclusion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tire-wear-failure-exclusion.mjs"]);
  },
};
