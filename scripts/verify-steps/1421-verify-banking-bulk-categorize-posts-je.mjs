export default {
  name: "verify:banking-bulk-categorize-posts-je",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-banking-bulk-categorize-posts-je.mjs"]);
  },
};
