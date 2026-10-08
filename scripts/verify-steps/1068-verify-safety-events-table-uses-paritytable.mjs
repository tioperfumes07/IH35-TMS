export default {
  name: "verify:safety-events-table-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-events-table-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-events-table-uses-paritytable.mjs"]);
    // BANK-F91206 piggyback — SafetyEventsTable / DrugAlcoholDashboard / ReturnToDuty leftover slate refuse
    ctx.run("node", ["scripts/verify-safety-events-da-rtd-slate-leftover-chrome.mjs"]);
  },
};
