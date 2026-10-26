// Lead 2026-10-26: wires verify-fill-shell-empty-states (authored in a Cursor fill PR, never wired — verify-guard-wired orphan).
// Claimed 18885 (seat lead, ≡1 mod 4) via scripts/claim-verify-step.mjs in #27823.
export default {
  name: "verify-fill-shell-empty-states",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fill-shell-empty-states.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fill-shell-empty-states.mjs"]);
  },
};
