export default {
  name: "verify-transaction-register-no-double-pagination",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-transaction-register-no-double-pagination.mjs"]) !== 0) {
      throw new Error("verify-transaction-register-no-double-pagination failed");
    }
  },
};
