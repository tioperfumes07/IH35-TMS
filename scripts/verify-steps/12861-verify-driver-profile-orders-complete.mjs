export default {
  name: "verify:driver-profile-orders-complete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-orders-complete.mjs"]);
  },
};
