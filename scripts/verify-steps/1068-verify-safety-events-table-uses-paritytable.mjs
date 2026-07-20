export default {
  name: "verify:safety-events-table-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-events-table-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-events-table-uses-paritytable.mjs"]);
  },
};
