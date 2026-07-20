export default {
  name: "verify:audit-log-viewer-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-log-viewer-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-audit-log-viewer-uses-paritytable.mjs"]);
  },
};
