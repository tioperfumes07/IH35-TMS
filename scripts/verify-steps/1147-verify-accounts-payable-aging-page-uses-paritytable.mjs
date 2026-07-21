export default {
  name: "verify:accounts-payable-aging-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounts-payable-aging-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-accounts-payable-aging-page-uses-paritytable.mjs"]);
  },
};
