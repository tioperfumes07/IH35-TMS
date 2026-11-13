// CC-2 ENG-17 — card/factoring payable residual: account 1090/2510 balance
// must equal sum of open source documents; 0 postings missing source_transaction_id.
export default {
  name: "verify:verify-card-factoring-payable-residual",
  run(ctx) {
    ctx.run("node", ["scripts/verify-card-factoring-payable-residual.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-card-factoring-payable-residual.mjs"]);
  },
};
