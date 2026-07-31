// LST-PICKER-01 WarrantyClaimsPage vendor picker now reads/writes mdata.vendors, matching the FK
// maintenance.warranty_claims.vendor_id REFERENCES mdata.vendors(id) (claim 1858).
export default {
  name: "verify-lst-picker01-warranty-vendor-fk-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-warranty-vendor-fk-parity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-warranty-vendor-fk-parity.mjs"]);
  },
};
