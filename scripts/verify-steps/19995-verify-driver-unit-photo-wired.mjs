export default {
  name: "verify:driver-unit-photo-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-unit-photo-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-unit-photo-wired.mjs"]);
  },
};
