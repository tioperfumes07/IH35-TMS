// Step 2842 historically wrapped verify-class-scoreboard-individual-columns (deleted 2026-11-12 with the
// program scoreboard). The step file keeps its claimed number and name for CLAIMED-NUMBERS.json; it now
// runs only the other guard it always carried.
export default {
  name: "verify-class-scoreboard-individual-columns",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-91192-bank-xfer-cc-email-slate-leftover-chrome.mjs"]);
  },
};
