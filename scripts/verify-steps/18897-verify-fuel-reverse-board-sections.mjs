// Lead 2026-10-26: wires verify-fuel-reverse-board-sections (authored in a Cursor fill PR, never wired — verify-guard-wired orphan).
// Claimed 18897 (seat lead, ≡1 mod 4) via scripts/claim-verify-step.mjs in #27823.
export default {
  name: "verify-fuel-reverse-board-sections",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-reverse-board-sections.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fuel-reverse-board-sections.mjs"]);
  },
};
