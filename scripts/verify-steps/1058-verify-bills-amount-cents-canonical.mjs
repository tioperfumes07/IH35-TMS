export default {
  name: "verify:bills-amount-cents-canonical",
  run(ctx) {
    // Selftest first — proves the guard still BITES before we trust a green run.
    ctx.run("node", ["scripts/verify-bills-amount-cents-canonical.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bills-amount-cents-canonical.mjs"]);
  },
};
