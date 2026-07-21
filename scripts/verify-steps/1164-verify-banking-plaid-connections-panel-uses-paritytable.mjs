export default {
  name: "verify:banking-plaid-connections-panel-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-plaid-connections-panel-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-plaid-connections-panel-uses-paritytable.mjs"]);
  },
};
