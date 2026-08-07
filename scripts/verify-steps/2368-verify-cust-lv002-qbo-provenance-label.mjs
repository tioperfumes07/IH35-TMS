// LV-002 — QBO provenance label must not claim clone from total_local (USMCA TMS-only).
export default {
  name: "verify:cust-lv002-qbo-provenance-label",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cust-lv002-qbo-provenance-label.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cust-lv002-qbo-provenance-label.mjs"]);
  },
};
