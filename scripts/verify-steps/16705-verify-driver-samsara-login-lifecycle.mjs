export default {
  name: "verify:driver-samsara-login-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-samsara-login-lifecycle.mjs"]);
  },
};
