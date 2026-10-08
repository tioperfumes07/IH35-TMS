export default {
  name: "verify:hos-viewer-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-hos-viewer-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-hos-viewer-uses-paritytable.mjs"]);
    ctx.run("node", ["scripts/verify-hos-safety-fine-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-hos-safety-fine-slate-leftover-chrome.mjs"]);
  },
};
