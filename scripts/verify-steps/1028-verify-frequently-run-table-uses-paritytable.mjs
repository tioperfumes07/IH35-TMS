export default {
  name: "verify:frequently-run-table-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-frequently-run-table-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-frequently-run-table-uses-paritytable.mjs"]);
    // BANK-F91208 piggyback — SubscriptionEditor / FrequentlyRunTable / SubscriptionManager leftover slate refuse
    ctx.run("node", ["scripts/verify-rpt-sub-slate-leftover-chrome.mjs"]);
  },
};
