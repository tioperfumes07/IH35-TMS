export default {
  name: "verify:safety-company-violations-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-company-violations-range.mjs"]);
  },
};
