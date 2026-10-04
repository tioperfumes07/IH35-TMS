export default {
  name: "verify:sales-tax-posting-split",
  run(ctx) {
    ctx.run("node", ["scripts/verify-sales-tax-posting-split.mjs"]);
  },
};
