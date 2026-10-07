// CHROME-001 — Customers Edit/New-transaction chrome parity with Vendors (verify-step 2016).
export default {
  name: "customers-chrome-action-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customers-chrome-action-parity.mjs"]);
    // BANK leftover refuse — VendorDetail/Customers/CashFlowReport house tokens
    ctx.run("node", ["scripts/verify-vend-cf-cust-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-vend-cf-cust-slate-leftover-chrome.mjs"]);
  },
};
