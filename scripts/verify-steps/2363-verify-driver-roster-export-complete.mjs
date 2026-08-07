// CLS-SILENT-CAP — driver roster CSV export must page to completion and never ship a short file
// (verify-step 2363 · Claude ODD band).
export default {
  name: "driver-roster-export-complete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-roster-export-complete.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-driver-roster-export-complete.mjs"]);
  },
};
