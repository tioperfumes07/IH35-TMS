// 1875-verify-customer-picker-not-capped-below-fleet — SAF-B29 family.
// Prod has ~2,693 customers. A listCustomers(limit: 200) with no search term returns the first 200
// alphabetically and silently drops 92% — on invoice creation, payment recording and load booking.
// A silent truncation is worse than a failure: the operator reads "customer not set up" and creates a
// DUPLICATE, splitting that customer's A/R across two records.
export default {
  name: "verify-customer-picker-not-capped-below-fleet",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-picker-not-capped-below-fleet.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-customer-picker-not-capped-below-fleet.mjs"]);
  },
};
