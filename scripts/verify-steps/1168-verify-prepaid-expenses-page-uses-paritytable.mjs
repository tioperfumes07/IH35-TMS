export default {
  name: "verify:prepaid-expenses-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-prepaid-expenses-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-prepaid-expenses-page-uses-paritytable.mjs"]);
  },
};
