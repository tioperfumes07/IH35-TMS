export default {
  name: "verify-users-list-duplicate-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-users-list-duplicate-search.mjs"]);
  },
};
