// LINK-F5182 / LINK-F5171 — factoring:home.equipment_loans reverse (vendor side) surface
// (verify-step 3309 — CC-1 band, claimed in #6868).
export default {
  name: "vendor-equipment-loans-reverse-section",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-equipment-loans-reverse-section.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-vendor-equipment-loans-reverse-section.mjs"]);
  },
};
