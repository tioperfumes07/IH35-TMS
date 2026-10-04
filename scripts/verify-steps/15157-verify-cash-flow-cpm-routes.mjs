export default {
  name: "verify:cash-flow-cpm-routes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-cpm-routes.mjs"]);
  },
};
