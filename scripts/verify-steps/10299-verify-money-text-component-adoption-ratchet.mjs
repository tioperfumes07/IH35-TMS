/** CC-2 — GLB-05 ("All money renders in QuickBooks number format. ONE money component. No
 * exceptions."). Publishes apps/frontend/src/components/MoneyText.tsx as that one component, and
 * guards a frozen ratchet against NEW hand-rolled toLocaleString(..., {style:'currency'}) money
 * formatting anywhere in the frontend — the count may only go down, never up. */
export default {
  name: "verify-money-text-component-adoption-ratchet",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-money-text-component-adoption-ratchet.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-money-text-component-adoption-ratchet.mjs"]);
  },
};
