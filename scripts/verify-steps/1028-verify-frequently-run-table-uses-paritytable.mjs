export default {
  name: "verify:frequently-run-table-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-frequently-run-table-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-frequently-run-table-uses-paritytable.mjs"]);
  },
};
