export default {
  name: "verify:db-pool-budget",
  run(ctx) {
    ctx.run("node", ["scripts/verify-db-pool-budget.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-db-pool-budget.mjs"]);
  },
};
