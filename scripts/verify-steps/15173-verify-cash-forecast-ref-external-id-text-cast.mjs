export default {
  name: "verify:cash-forecast-ref-external-id-text-cast",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-forecast-ref-external-id-text-cast.mjs"]);
  },
};
