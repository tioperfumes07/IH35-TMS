// Lead 2026-10-26: wires verify-factoring-profile-admin-board (authored in a Cursor fill PR, never wired — verify-guard-wired orphan).
// Claimed 18873 (seat lead, ≡1 mod 4) via scripts/claim-verify-step.mjs in #27823.
export default {
  name: "verify-factoring-profile-admin-board",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-profile-admin-board.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-factoring-profile-admin-board.mjs"]);
  },
};
