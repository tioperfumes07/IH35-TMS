export default {
  name: "verify-entity-badge-single-source",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-entity-badge-single-source.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
