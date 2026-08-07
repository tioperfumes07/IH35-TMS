// SETL-PICK-01 / PICK-006 — Auto-deduction Type catalog picker ratchet (claim 2286).
export default {
  name: "verify:setl-deduction-type-catalog",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-setl-deduction-type-catalog.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-setl-deduction-type-catalog.mjs"]);
  },
};
