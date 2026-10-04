export default {
  name: "verify:tax-form-threshold-year-keyed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tax-form-threshold-year-keyed.mjs"]);
  },
};
