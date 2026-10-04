export default {
  name: "verify:transfer-bank-balance-update-zero-rows-check",
  run(ctx) {
    ctx.run("node", ["scripts/verify-transfer-bank-balance-update-zero-rows-check.mjs"]);
  },
};
