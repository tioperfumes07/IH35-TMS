export default {
  name: "verify:banking-designview-qbo-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-designview-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-designview-slate-leftover-chrome.mjs"]);
    await ctx.run("node", ["scripts/verify-banking-designview-qbo-parity.mjs"]);
    // BANK-F91446 — C-24 QBO parity tail (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c24-qbo-parity-tail.mjs", "--selftest"]);
    // ROUND 441 C1–C4 — modal close / edit hydrate / CC liability children / vendor column dash.
    await ctx.run("node", ["scripts/verify-r441-banking-modal-close-cc-vendor.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-r441-banking-modal-close-cc-vendor.mjs"]);
  },
};
