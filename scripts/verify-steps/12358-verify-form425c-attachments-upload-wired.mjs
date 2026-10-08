export default {
  name: "verify:form425c-attachments-upload-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-form425c-attachments-upload-wired.mjs"]);
    ctx.run("node", ["scripts/verify-form425c-tabs-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-form425c-tabs-slate-leftover-chrome.mjs"]);
  },
};
