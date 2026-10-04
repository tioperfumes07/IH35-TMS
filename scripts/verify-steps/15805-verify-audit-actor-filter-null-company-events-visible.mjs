export default {
  name: "verify:audit-actor-filter-null-company-events-visible",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-actor-filter-null-company-events-visible.mjs"]);
  },
};
