/** Verify-step 3560 — CUST-F3560 customer detail recent invoices ParityTable surface bar. */
export default {
  name: "verify-customer-detail-invoices-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-detail-invoices-parity-surface-bar.mjs"]);
    // BANK-F91470 — customers ORDERS complete (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-customers-orders-complete.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-files-anomaly-merge-slate-leftover-chrome.mjs"]);
  },
};
