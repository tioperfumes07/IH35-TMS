export default {
  name: "verify:cash-flow-tabs-entity-scoped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-tabs-entity-scoped.mjs"]);
  },
};
