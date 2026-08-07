// verify-disp-wire-06-load-expense-link — CLS-DISP-WIRE-06. RED only on TMS-NATIVE fuel costs
// (load_required=true) missing their load, NEVER on the 1,548 pre-TMS-dispatch imports, which are
// expected state per the owner ruling. Keys on the load_required discriminator rather than a row
// count, which is what stops it reddening on correct behaviour. Selftest first so a stale guard fails
// loudly instead of vacuously.
export default {
  name: "verify:disp-wire-06-load-expense-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-disp-wire-06-load-expense-link.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-disp-wire-06-load-expense-link.mjs"]);
  },
};
