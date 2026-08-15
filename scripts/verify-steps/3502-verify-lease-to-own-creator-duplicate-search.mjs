export default {
  name: "verify-lease-to-own-creator-duplicate-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lease-to-own-creator-duplicate-search.mjs"]);
  },
};
