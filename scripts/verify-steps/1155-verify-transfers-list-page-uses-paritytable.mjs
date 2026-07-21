export default {
  name: "verify:transfers-list-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-transfers-list-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-transfers-list-page-uses-paritytable.mjs"]);
  },
};
