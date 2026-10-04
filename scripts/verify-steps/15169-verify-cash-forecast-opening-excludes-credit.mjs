export default {
  name: "verify:cash-forecast-opening-excludes-credit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-forecast-opening-excludes-credit.mjs"]);
  },
};
