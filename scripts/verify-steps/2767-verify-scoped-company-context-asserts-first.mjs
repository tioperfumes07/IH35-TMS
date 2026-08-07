// setScopedCompanyContext must assert company membership BEFORE it sets app.operating_company_id.
// The helper now concentrates the cross-entity authorization of ~72 handlers, so its ordering is a
// single point of failure that the CALL-SITE guard (2763) structurally cannot see: every call site
// stays green while the helper silently stops asserting.
//
// Same missing-step-file gap as 2763 — the number was claimed, the guard written and registered as
// type='enforced', and no step file ever created, so it ran nowhere.
export default {
  name: "verify-scoped-company-context-asserts-first",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-scoped-company-context-asserts-first.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-scoped-company-context-asserts-first.mjs"]);
  },
};
