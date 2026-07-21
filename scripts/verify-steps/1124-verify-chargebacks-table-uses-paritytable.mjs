export default {
  name: "verify:chargebacks-table-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-chargebacks-table-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-chargebacks-table-uses-paritytable.mjs"]);
  },
};
