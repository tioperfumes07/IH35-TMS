export default {
  name: "verify:edi-transaction-log-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-edi-transaction-log-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-edi-transaction-log-uses-paritytable.mjs"]);
  },
};
