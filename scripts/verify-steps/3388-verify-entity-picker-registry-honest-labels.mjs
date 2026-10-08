export default {
  name: "verify-entity-picker-registry-honest-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entity-picker-registry-honest-labels.mjs"]);
    // BANK leftover refuse — DatePicker / DateTimePicker / ListErrorState house tokens
    await ctx.run("node", ["scripts/verify-91295-datepicker-listerr-slate-leftover-chrome.mjs"]);
  },
};
