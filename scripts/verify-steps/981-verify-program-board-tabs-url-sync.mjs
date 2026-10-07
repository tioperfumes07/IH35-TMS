export default {
  name: "verify:program-board-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-program-board-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-program-board-tabs-url-sync.mjs"]);
    // BANK leftover refuse — ProgramBoard/Tracker/ModuleMatrix house tokens
    ctx.run("node", ["scripts/verify-program-board-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-program-board-slate-leftover-chrome.mjs"]);
  },
};
