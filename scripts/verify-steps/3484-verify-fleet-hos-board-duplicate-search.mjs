export default {
  name: "verify-fleet-hos-board-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleet-hos-board-duplicate-search.mjs"]);
    // BANK leftover refuse — DrugAlcohol/FineDetail/PositionHistory house tokens
    await ctx.run("node", ["scripts/verify-da-fine-poshist-slate-leftover-chrome.mjs"]);
  },
};
