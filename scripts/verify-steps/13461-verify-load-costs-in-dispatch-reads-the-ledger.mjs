export default {
  name: "verify:load-costs-in-dispatch-reads-the-ledger",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-costs-in-dispatch-reads-the-ledger.mjs"]);
  },
};
