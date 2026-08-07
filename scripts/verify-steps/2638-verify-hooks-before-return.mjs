// verify-hooks-before-return — React matches hooks by CALL ORDER, so a hook placed after a guard
// clause runs on some renders and not others; React then reads a different hook's state and the tree
// throws "Rendered fewer hooks than expected". In this app that is a blank screen behind an error
// boundary — the page does not misbehave, it disappears. Baseline is currently ZERO: this locks a
// clean state rather than a backlog.
export default {
  name: "verify:hooks-before-return",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-hooks-before-return.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-hooks-before-return.mjs"]);
  },
};
