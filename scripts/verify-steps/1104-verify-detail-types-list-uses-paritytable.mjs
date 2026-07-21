export default {
  name: "verify:detail-types-list-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-detail-types-list-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-detail-types-list-uses-paritytable.mjs"]);
  },
};
