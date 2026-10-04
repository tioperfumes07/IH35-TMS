export default {
  name: "verify:cash-forecast-routes-registered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-forecast-routes-registered.mjs"]);
  },
};
