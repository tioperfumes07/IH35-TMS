export default {
  name: "verify:undo-is-single-transaction",
  run(ctx) {
    ctx.run("node", ["scripts/verify-undo-is-single-transaction.mjs"]);
  },
};
