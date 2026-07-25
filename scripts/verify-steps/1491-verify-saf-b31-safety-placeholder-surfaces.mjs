// SAF-B31 — the two Safety placeholder surfaces (/safety/reports, /safety/audit-425c) must keep
// querying real, entity-scoped backend readers. Static prose that promises a feature is the defect.
// Selftest runs first so the guard can never silently degrade into an always-pass.
export default {
  name: "verify:saf-b31-safety-placeholder-surfaces",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-b31-safety-placeholder-surfaces.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-saf-b31-safety-placeholder-surfaces.mjs"]);
  },
};
