export default {
  name: "verify:qb-import-tab-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qb-import-tab-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qb-import-tab-uses-paritytable.mjs"]);
  },
};
