export default {
  name: "verify:factoring-banking-kpis-tie-to-ledger",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-banking-kpis-tie-to-ledger.mjs"]);
  },
};
