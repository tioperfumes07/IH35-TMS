export default {
  name: "verify-print-opens-canonical-document",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-print-opens-canonical-document.mjs"]);
    await ctx.run("node", ["scripts/verify-91077-billpay-dispatchmargin-submitq-slate-leftover-chrome.mjs"]);
  },
};
