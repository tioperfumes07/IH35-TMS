export default {
  name: "verify:driver-phone-login-link-cas",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-phone-login-link-cas.mjs"]);
  },
};
