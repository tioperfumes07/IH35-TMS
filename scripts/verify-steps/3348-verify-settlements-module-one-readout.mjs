export default {
  name: "verify:settlements-module-one-readout",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlements-module-one-readout.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlements-module-one-readout.mjs"]);
    // BANK-F91507 — SettlementsPage leftover #64748b DataPanel accent refuse (this EVEN host already owns the live guard).
  },
};
