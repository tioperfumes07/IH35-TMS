export default {
  name: "verify:work-order-create-clears-stale-entity-fks",
  run(ctx) {
    ctx.run("node", ["scripts/verify-work-order-create-clears-stale-entity-fks.mjs"]);
  },
};
