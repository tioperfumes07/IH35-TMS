export default {
  name: "verify-fleet-hos-board-duplicate-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fleet-hos-board-duplicate-search.mjs"]);
    ctx.run("node", ["scripts/verify-fleet-hos-board-duplicate-search.mjs", "--selftest"]);
  },
};
