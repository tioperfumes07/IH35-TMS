export default {
  name: "verify:driver-manager-shared-drivers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-manager-shared-drivers.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-manager-shared-drivers.mjs"]);
  },
};
