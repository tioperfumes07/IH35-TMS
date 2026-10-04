export default {
  name: "verify:driver-message-persistence-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-message-persistence-identity.mjs"]);
  },
};
