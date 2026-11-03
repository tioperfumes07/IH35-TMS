export default {
  name: "verify:nonmoney-vendor-complete-rosters",
  run(ctx) {
    ctx.run("node", ["scripts/verify-nonmoney-vendor-complete-rosters.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-nonmoney-vendor-complete-rosters.mjs"]);
  },
};
