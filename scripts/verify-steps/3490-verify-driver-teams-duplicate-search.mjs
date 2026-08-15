export default {
  name: "verify-driver-teams-duplicate-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-teams-duplicate-search.mjs"]);
  },
};
