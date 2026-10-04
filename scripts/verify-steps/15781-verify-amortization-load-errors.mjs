export default {
  name: "verify:amortization-load-errors",
  run(ctx) {
    ctx.run("node", ["scripts/verify-amortization-load-errors.mjs"]);
  },
};
