export default {
  name: "verify:one-profile-per-driver",
  run(ctx) {
    ctx.run("node", ["scripts/verify-one-profile-per-driver.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-one-profile-per-driver.mjs"]);
  },
};
