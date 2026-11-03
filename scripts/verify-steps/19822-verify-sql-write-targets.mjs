export default {
  name: "verify:sql-write-targets",
  run(ctx) {
    ctx.run("node", ["scripts/verify-sql-write-targets.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-sql-write-targets.mjs"]);
  },
};
