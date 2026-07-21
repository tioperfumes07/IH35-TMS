export default {
  name: "verify:dispatch-catalog-list-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-catalog-list-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-catalog-list-uses-paritytable.mjs"]);
  },
};
