export default {
  name: "verify:company-settlements-list-route",
  run(ctx) {
    ctx.run("node", ["scripts/verify-company-settlements-list-route.mjs"]);
  },
};
