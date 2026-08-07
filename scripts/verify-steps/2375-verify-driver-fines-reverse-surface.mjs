// CLS-REVERSE-LINKAGE-MISSING / SAF-F16 — driver fines reverse surface, both fines tables
// (verify-step 2375 — renumbered off a duplicate 2361 · Claude ODD band).
export default {
  name: "driver-fines-reverse-surface",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-fines-reverse-surface.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-driver-fines-reverse-surface.mjs"]);
  },
};
