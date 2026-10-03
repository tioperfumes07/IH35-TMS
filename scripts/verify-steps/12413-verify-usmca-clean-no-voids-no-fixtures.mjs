// ROUND 390.1 (CC-1): verify-usmca-clean-no-voids-no-fixtures was an ORPHAN (no workflow, no step) and is now wired.
// The shrink-only rule is selftested here; the live half runs against whatever database the runner provides — a fresh
// verify DB has no USMCA company and says so (never called proof); against production it is the live check.
export default {
  name: "verify-usmca-clean-no-voids-no-fixtures",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-usmca-clean-no-voids-no-fixtures.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-usmca-clean-no-voids-no-fixtures.mjs"]);
  },
};
