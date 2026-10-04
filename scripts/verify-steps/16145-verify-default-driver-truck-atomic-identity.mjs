export default {
  name: "verify:default-driver-truck-atomic-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-default-driver-truck-atomic-identity.mjs"]);
  },
};
