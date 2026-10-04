export default {
  name: "verify:safety-mounted-route-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-mounted-route-identity.mjs"]);
  },
};
