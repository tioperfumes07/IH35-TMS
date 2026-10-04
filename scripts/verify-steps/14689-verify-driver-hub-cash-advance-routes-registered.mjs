export default {
  name: "verify:driver-hub-cash-advance-routes-registered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-hub-cash-advance-routes-registered.mjs"]);
  },
};
