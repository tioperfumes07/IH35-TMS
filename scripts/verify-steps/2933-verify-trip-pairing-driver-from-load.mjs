export default {
  name: "verify:trip-pairing-driver-from-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-trip-pairing-driver-from-load.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-trip-pairing-driver-from-load.mjs"]);
  },
};
