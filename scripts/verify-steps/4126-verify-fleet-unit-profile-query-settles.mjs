/** @matrix-built {"modules":["fleet"],"cols":["unit"],"leafRe":"^home\\.roster\\.unit-EntityLink$|^unit\\.profile\\.","task":"LV-fleet-unit-profile-loading-20260819"} */
export default {
  name: "verify-fleet-unit-profile-query-settles",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-fleet-unit-profile-query-settles.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fleet-unit-profile-query-settles.mjs"]);
  },
};
