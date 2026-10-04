export default {
  name: "verify:company-violations-reverse-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-company-violations-reverse-range.mjs"]);
  },
};
