export default {
  name: "verify:geofences-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-geofences-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-geofences-page-uses-paritytable.mjs"]);
  },
};
