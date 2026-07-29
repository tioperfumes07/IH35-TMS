// Step 1733 — vendor types must come from catalogs.vendor_types, never a hardcoded list.
// The catalog was seeded per entity and completely unread while the UI used a frozen TS union:
// a type could be selected but never added, renamed or retired.
export default {
  name: "verify:vendor-type-catalog-backed",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vendor-type-catalog-backed.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-vendor-type-catalog-backed.mjs"]);
  },
};
