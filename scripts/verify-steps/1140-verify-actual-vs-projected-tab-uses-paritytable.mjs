export default {
  name: "verify:actual-vs-projected-tab-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-actual-vs-projected-tab-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-actual-vs-projected-tab-uses-paritytable.mjs"]);
  },
};
