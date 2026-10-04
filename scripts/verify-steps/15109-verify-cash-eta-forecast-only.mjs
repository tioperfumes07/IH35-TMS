export default {
  name: "verify:cash-eta-forecast-only",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-eta-forecast-only.mjs"]);
  },
};
