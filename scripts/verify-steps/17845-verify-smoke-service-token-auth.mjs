export default {
  name: "verify:smoke-service-token-auth",
  run(ctx) {
    ctx.run("node", ["scripts/verify-smoke-service-token-auth.mjs"]);
  },
};
