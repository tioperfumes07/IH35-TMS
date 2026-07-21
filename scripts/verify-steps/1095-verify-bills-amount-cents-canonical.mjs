export default {
  name: "verify:bills-amount-cents-canonical",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bills-amount-cents-canonical.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bills-amount-cents-canonical.mjs"]);
  },
};
