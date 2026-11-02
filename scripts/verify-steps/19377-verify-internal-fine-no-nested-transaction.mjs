export default {
  name: "verify:internal-fine-no-nested-transaction",
  run(ctx) {
    ctx.run("node", ["scripts/verify-internal-fine-no-nested-transaction.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-internal-fine-no-nested-transaction.mjs"]);
  },
};
