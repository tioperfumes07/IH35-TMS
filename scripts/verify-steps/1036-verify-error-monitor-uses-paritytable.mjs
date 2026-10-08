export default {
  name: "verify:error-monitor-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-error-monitor-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-error-monitor-uses-paritytable.mjs"]);
    ctx.run("node", ["scripts/verify-admin-import-obs-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-admin-import-obs-slate-leftover-chrome.mjs"]);
  },
};
