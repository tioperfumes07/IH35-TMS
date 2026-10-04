export default {
  name: "verify:cash-eta-rebucket-flag-gated",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-eta-rebucket-flag-gated.mjs"]);
  },
};
