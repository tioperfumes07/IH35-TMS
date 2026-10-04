export default {
  name: "verify:maint-parts-ledger-company-audits",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-parts-ledger-company-audits.mjs"]);
  },
};
