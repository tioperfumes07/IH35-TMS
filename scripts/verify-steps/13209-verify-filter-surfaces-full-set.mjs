export default {
  name: "verify:filter-surfaces-full-set",
  run(ctx) {
    ctx.run("node", ["scripts/verify-filter-surfaces-full-set.mjs"]);
  },
};
