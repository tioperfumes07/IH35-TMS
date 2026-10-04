export default {
  name: "verify:driver-pay-practical-fallback-locked",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-pay-practical-fallback-locked.mjs"]);
  },
};
