export default {
  name: "verify:sales-tax-entitylink-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-sales-tax-entitylink-reverse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-sales-tax-entitylink-reverse.mjs"]);
  },
};
