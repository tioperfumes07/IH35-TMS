export default {
  name: "verify:wo-detail-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-detail-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-wo-detail-uses-paritytable.mjs"]);
  },
};
