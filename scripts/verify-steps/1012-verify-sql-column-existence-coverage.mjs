export default {
  name: "verify:sql-column-existence-coverage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-sql-column-existence-coverage.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-sql-column-existence-coverage.mjs"]);
  },
};
