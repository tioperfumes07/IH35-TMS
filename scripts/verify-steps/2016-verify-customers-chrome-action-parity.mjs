// CHROME-001 — Customers Edit/New-transaction chrome parity with Vendors (verify-step 2016).
export default {
  name: "customers-chrome-action-parity",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-customers-chrome-action-parity.mjs"]);
  },
};
