export default {
  name: "verify-drivers-roster-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-roster-suppress-toolbar-search.mjs"]);
  },
};
