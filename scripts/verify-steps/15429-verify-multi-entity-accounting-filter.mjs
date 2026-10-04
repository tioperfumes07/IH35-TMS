export default {
  name: "verify:multi-entity-accounting-filter",
  run(ctx) {
    ctx.run("node", ["scripts/verify-multi-entity-accounting-filter.mjs"]);
  },
};
