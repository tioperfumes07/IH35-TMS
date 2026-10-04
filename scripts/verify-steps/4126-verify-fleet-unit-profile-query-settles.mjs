/** @matrix-built {"modules":["fleet"],"cols":["unit"],"leafRe":"^home\\.roster\\.unit-EntityLink$|^unit\\.profile\\.","task":"LV-fleet-unit-profile-loading-20260819"} */
export default {
  name: "verify-fleet-unit-profile-query-settles",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-fleet-unit-profile-query-settles.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fleet-unit-profile-query-settles.mjs"]);
    // BANK-F91504 — LoadsReport leftover fontSize: 11 totals refuse (13521 is ODD; leftover now on this EVEN host).
    ctx.run("node", ["scripts/verify-loads-report-surface.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-loads-report-surface.mjs"]);
  },
};
