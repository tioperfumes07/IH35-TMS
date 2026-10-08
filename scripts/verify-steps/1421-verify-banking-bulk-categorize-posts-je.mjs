export default {
  name: "verify:banking-bulk-categorize-posts-je",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-banking-bulk-categorize-posts-je.mjs"]);
    // ROUND 441.19 CHAIN-05 orphan-guard wiring (Devin-A batch-23)
    ctx.run("node", ["scripts/verify-bank-categorize-posts-chain05-matrix.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-categorize-posts-chain05-matrix.mjs"]);
  },
};
