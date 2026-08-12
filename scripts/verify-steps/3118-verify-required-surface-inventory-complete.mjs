/**
 * CLAIMED 3118 — Cursor EVEN — verify-required-surface-inventory-complete
 */
export default {
  name: "verify-required-surface-inventory-complete",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-required-surface-inventory-complete.mjs"]);
  },
};
