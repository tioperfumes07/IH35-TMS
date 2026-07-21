export default {
  name: "verify:bills-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bills-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bills-page-uses-paritytable.mjs"]);
  },
};
