export default {
  name: "verify:admin-audit-log-viewer-chrome",
  run(ctx) {
    ctx.run("node", ["scripts/verify-admin-audit-log-viewer-chrome.mjs"]);
  },
};
