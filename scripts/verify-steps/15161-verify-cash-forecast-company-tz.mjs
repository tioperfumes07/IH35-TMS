export default {
  name: "verify:cash-forecast-company-tz",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-forecast-company-tz.mjs"]);
  },
};
