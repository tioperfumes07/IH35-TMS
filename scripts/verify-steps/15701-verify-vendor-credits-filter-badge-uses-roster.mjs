export default {
  name: "verify:vendor-credits-filter-badge-uses-roster",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-credits-filter-badge-uses-roster.mjs"]);
  },
};
