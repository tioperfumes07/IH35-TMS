export default {
  name: "verify:insurance-claims-reverse-accident-incident",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-claims-reverse-accident-incident.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-insurance-claims-reverse-accident-incident.mjs"]);
    // BANK leftover refuse — ClaimsTab/PoliciesList/FleetCovered house tokens
    ctx.run("node", ["scripts/verify-ins-claims-pol-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ins-claims-pol-slate-leftover-chrome.mjs"]);
    // BANK leftover slate refuse — ins landing/lawsuits/reports orphan-guard wiring (Devin-A batch-23)
    ctx.run("node", ["scripts/verify-ins-land-rpt-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ins-land-rpt-slate-leftover-chrome.mjs"]);
  },
};
