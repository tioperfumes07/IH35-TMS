export default {
  name: "verify:sql-read-targets",
  run(ctx) {
    ctx.run("node", ["scripts/verify-sql-read-targets.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-sql-read-targets.mjs"]);
  },
};
