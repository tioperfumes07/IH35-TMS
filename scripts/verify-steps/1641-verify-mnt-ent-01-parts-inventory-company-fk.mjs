/** MNT-ENT-01 — parts_inventory.operating_company_id → org.companies FK. */
export default {
  name: "verify-mnt-ent-01-parts-inventory-company-fk",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-mnt-ent-01-parts-inventory-company-fk.mjs"]);
    await ctx.run("node", ["scripts/verify-mnt-ent-01-parts-inventory-company-fk.mjs", "--selftest"]);
  },
};
