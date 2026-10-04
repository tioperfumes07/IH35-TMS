export default {
  name: "verify:vehicle-driver-pairing-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vehicle-driver-pairing-tenant-scope.mjs"]);
  },
};
