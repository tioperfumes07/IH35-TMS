export default {
  name: "verify:day-summary-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-day-summary-tenant-scope.mjs"]);
  },
};
