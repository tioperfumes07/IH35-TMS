// MDATA-F07/F08 — a route that writes a driver invite must prove the caller belongs to the invited
// driver's company BEFORE the write. Keys on the SIDE EFFECT (the invite write), not on a helper
// import, because verify-company-membership-assert is opt-in by import: a handler with ZERO asserts —
// exactly the vulnerable state — is invisible to it, which is how F07/F08 shipped green.
//
// Same missing-step-file gap as 2763/2767: number claimed, guard written, law registered as
// type='enforced', no step file — so it ran nowhere.
export default {
  name: "verify-invite-write-entity-gated",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invite-write-entity-gated.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-invite-write-entity-gated.mjs"]);
  },
};
