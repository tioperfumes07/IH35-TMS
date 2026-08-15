export default {
  name: "verify-factoring-queue-duplicate-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-queue-duplicate-search.mjs"]);
  },
};
