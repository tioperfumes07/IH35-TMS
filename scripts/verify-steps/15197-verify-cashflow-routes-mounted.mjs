export default {
  name: "verify:cashflow-routes-mounted",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cashflow-routes-mounted.mjs"]);
  },
};
