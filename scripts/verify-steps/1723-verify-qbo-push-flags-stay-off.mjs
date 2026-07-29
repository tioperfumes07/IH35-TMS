// Step 1723 — parallel books: no migration may enable a QBO write-back flag.
// QuickBooks is the system of record; this system syncs FROM it and never writes back (owner law).
// Rule 17: guards wire ONLY through scripts/verify-steps/NNNN-*.mjs.
export default {
  name: "verify:qbo-push-flags-stay-off",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-push-flags-stay-off.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-qbo-push-flags-stay-off.mjs"]);
  },
};
