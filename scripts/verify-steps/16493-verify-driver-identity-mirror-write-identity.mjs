export default {
  name: "verify:driver-identity-mirror-write-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-identity-mirror-write-identity.mjs"]);
  },
};
