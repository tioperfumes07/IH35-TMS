// Step 1854 — the HELD vendors_vendor_type_check-relax migration, its .held-migrations.json
// registration, and the backend vendorTypeSchema must stay in lockstep with each other (companion
// to guard 1852 / PR #3884). See scripts/verify-vendor-type-check-relaxed.mjs for the defect class.
export default {
  name: "verify:vendor-type-check-relaxed",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vendor-type-check-relaxed.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-vendor-type-check-relaxed.mjs"]);
  },
};
