export default {
  name: "verify:late-arrivals-error-entitylink",
  run(ctx) {
    ctx.run("node", ["scripts/verify-late-arrivals-error-entitylink.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-late-arrivals-error-entitylink.mjs"]);
    // BANK leftover refuse — LateArrival/InvoiceSearch/PostedWhileTourOpen house tokens
    ctx.run("node", ["scripts/verify-late-inv-tour-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-late-inv-tour-slate-leftover-chrome.mjs"]);
  },
};
