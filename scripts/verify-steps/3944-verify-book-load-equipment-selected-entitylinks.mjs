export default {
  name: "verify-book-load-equipment-selected-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-book-load-equipment-selected-entitylinks.mjs"]);
    // BANK-F91212 piggyback — BookLoadEquipment / BookLoadCustomer / OcrDropZone leftover slate refuse
    await ctx.run("node", ["scripts/verify-bookload-equip-cust-ocr-slate-leftover-chrome.mjs"]);
  },
};
