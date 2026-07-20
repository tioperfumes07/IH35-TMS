export default {
  name: "verify:asset-list-table-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-asset-list-table-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-asset-list-table-uses-paritytable.mjs"]);
  },
};
