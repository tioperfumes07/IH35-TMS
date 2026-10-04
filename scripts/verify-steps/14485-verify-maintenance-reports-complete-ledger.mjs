export default {
  name: "verify:maintenance-reports-complete-ledger",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-reports-complete-ledger.mjs"]);
  },
};
