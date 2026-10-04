export default {
  name: "verify:driver-phone-login-disable-reenable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-phone-login-disable-reenable.mjs"]);
  },
};
