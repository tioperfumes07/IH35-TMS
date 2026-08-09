export default {
  name: "verify-settlement-debt-view-not-stub",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-debt-view-not-stub.mjs"]);
    // ACCT-F272-DEPLOY-BLOCKER — same view-stub class: phantom base-table column in
    // 202612440000 froze Render preDeploy. Wired here (existing claim 2912) so the
    // ratchet lands with the fix without a second CLAIM-RESERVE during the outage.
    await ctx.run("node", [
      "scripts/verify-liabilities-view-no-phantom-created-by.mjs",
    ]);
  },
};
