// LINK-F5173 / LINK-F5171 — driver settlement disputes + liabilities reverse surface
// (verify-step 3281 — CC-1 band, claimed in #6734).
export default {
  name: "driver-settlement-finance-reverse-section",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-settlement-finance-reverse-section.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-driver-settlement-finance-reverse-section.mjs"]);
  },
};
