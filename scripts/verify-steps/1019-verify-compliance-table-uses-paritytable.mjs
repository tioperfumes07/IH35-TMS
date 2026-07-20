export default {
  name: "verify:compliance-table-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-compliance-table-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-compliance-table-uses-paritytable.mjs"]);
  },
};
