export default {
  name: "verify:safety-company-year",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-company-year.mjs"]);
  },
};
