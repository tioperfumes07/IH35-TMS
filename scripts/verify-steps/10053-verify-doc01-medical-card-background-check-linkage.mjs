/** DOC-01 D2/D5 — medical_card/background_check document linkage migration + allowlist sync. */
export default {
  name: "verify-doc01-medical-card-background-check-linkage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-doc01-medical-card-background-check-linkage.mjs"]);
    await ctx.run("node", ["scripts/verify-doc01-medical-card-background-check-linkage.mjs", "--selftest"]);
  },
};
