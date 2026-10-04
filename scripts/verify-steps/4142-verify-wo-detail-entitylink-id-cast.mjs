export default {
  name: "verify:wo-detail-entitylink-id-cast",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-detail-entitylink-id-cast.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-wo-detail-entitylink-id-cast.mjs"]);
    // BANK-F91517 leftover #94a3b8 + BANK-F91549 leftover slate class refuse (4177 is ODD).
    ctx.run("node", ["scripts/verify-system-module.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-system-module.mjs"]);
  },
};
