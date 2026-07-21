export default {
  name: "verify:faro-import-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-faro-import-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-faro-import-page-uses-paritytable.mjs"]);
  },
};
