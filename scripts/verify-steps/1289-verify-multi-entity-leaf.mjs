export default {
  name: "verify-multi-entity-leaf",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-multi-entity-leaf.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-multi-entity-leaf.mjs", "--selftest"]);
  },
};
