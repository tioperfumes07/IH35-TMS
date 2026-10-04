export default {
  name: "verify:cash-forecast-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-forecast-tenant-scope.mjs"]);
  },
};
