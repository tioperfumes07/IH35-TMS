export default {
  name: "verify:fixed-assets-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fixed-assets-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fixed-assets-page-uses-paritytable.mjs"]);
  },
};
